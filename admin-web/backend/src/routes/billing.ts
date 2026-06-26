'use strict';
import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { sendPaymentReceipt, sendCancellationConfirmation } from '../email';
import { calcVat, countryFromMspWebhook, OSS_THRESHOLD_CENTS, taxLabel } from '../vat';
import crypto from 'crypto';

const COOLING_OFF_MS = 14 * 24 * 60 * 60 * 1000;

// ── MultiSafepay refund ───────────────────────────────────────────────────────
async function mspRefund(orderId: string, amountCents: number, currency: string, description: string): Promise<boolean> {
  const apiKey = process.env.MULTISAFEPAY_API_KEY;
  if (!apiKey) {
    // No API key configured — log and continue (dev/test environment)
    console.warn('MULTISAFEPAY_API_KEY not set — refund not issued for order', orderId);
    return false;
  }
  const base = process.env.MULTISAFEPAY_ENV === 'live'
    ? 'https://api.multisafepay.com/v1/json'
    : 'https://testapi.multisafepay.com/v1/json';

  const res = await fetch(`${base}/orders/${orderId}/refunds`, {
    method: 'POST',
    headers: { 'api_key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      amount:      amountCents,
      currency,
      description,
    }),
  });
  const body = await res.json() as any;
  return body?.success === true;
}

// ── MSP Webhook (public, HMAC-verified) ──────────────────────────────────────
export async function handleMultiSafepayWebhook(req: Request, res: Response): Promise<void> {
  const provided = req.headers['auth'] as string | undefined;
  const secret   = process.env.MULTISAFEPAY_WEBHOOK_SECRET || '';
  if (secret) {
    const expected = crypto
      .createHmac('sha512', secret)
      .update(JSON.stringify(req.body))
      .digest('hex');
    if (provided !== expected) { res.status(401).json({ error: 'invalid signature' }); return; }
  }

  const body         = req.body;
  const orderId      = body?.order_id ?? body?.transaction_id ?? '';
  const status       = body?.status ?? '';
  const grossCents   = Math.round((body?.amount ?? 0) * 100);
  const currency     = body?.currency ?? 'EUR';
  const accountPin   = body?.var1 ?? '';
  const product      = body?.var2 ?? '';

  if (!orderId || !accountPin || !product) { res.status(400).json({ error: 'missing fields' }); return; }

  // Determine buyer country for VAT OSS
  const countryCode = countryFromMspWebhook(body);
  const vat         = calcVat(grossCents, countryCode);

  const pool: Pool  = (req as any).pool;

  // Guard: reject paid purchases from countries where paid isn't available yet.
  // The app should prevent this UI-side, but MSP webhook is the authoritative check.
  const { rows: [flag] } = await pool.query(
    `SELECT paid_available FROM mwt_country_availability WHERE country_code=$1`,
    [vat.country_code]
  );
  if (flag && !flag.paid_available) {
    // Return 200 to MSP (don't retry) but don't record or upgrade tier
    res.json({ ok: false, reason: 'paid_not_available_in_country' });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const customerEmail = body?.customer?.email ?? '';
    await client.query(
      `INSERT INTO mwt_customers (account_pin, email, tier, country_code)
       VALUES ($1, $2, 'pigeon', $3)
       ON CONFLICT (account_pin) DO UPDATE SET
         country_code = EXCLUDED.country_code`,
      [accountPin, customerEmail, vat.country_code]
    );

    const { rows: [customer] } = await client.query(
      `SELECT id, email FROM mwt_customers WHERE account_pin = $1`, [accountPin]
    );
    if (!customer) throw new Error('customer not found after upsert');

    const { rows: [{ n }] } = await client.query(`SELECT nextval('mwt_invoice_seq') AS n`);
    const invoiceNumber = `MWT-${new Date().getFullYear()}-${String(n).padStart(6, '0')}`;

    await client.query(
      `INSERT INTO mwt_billing_events
         (customer_id, event_type, product, amount_cents, currency,
          vat_cents, vat_rate, vat_country, net_cents, tax_region,
          multisafepay_order_id, multisafepay_status, invoice_number, description)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       ON CONFLICT (invoice_number) DO UPDATE SET multisafepay_status = EXCLUDED.multisafepay_status`,
      [
        customer.id,
        status === 'completed' ? 'payment' : 'pending',
        product, grossCents, currency,
        vat.vat_cents, vat.vat_rate, vat.country_code, vat.net_cents, vat.tax_region,
        orderId, status, invoiceNumber,
        `${product} — ${taxLabel(vat)}`,
      ]
    );

    if (status === 'completed') {
      const tierMap: Record<string, string> = {
        tits:                   'tits',
        flock_of_geese:         'flock_of_geese',
        sustainability_monthly: 'sustainability',
        business_monthly:       'business',
      };
      const newTier = tierMap[product];
      if (newTier) {
        await client.query(
          `UPDATE mwt_customers SET tier = $1 WHERE id = $2`, [newTier, customer.id]
        );
      }
      sendPaymentReceipt({
        to: customer.email, invoiceNumber, productName: product,
        amountCents: grossCents, netCents: vat.net_cents,
        vatCents: vat.vat_cents, vatRate: vat.vat_rate,
        currency, date: new Date().toISOString().slice(0, 10),
      }).catch(() => {});
    }

    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ── Admin router (JWT-protected) ─────────────────────────────────────────────
export function createBillingRouter(pool: Pool): Router {
  const r = Router();

  r.get('/', async (_req, res) => {
    const { rows } = await pool.query(
      `SELECT c.id, c.account_pin, c.email, c.tier, c.country_code, c.created_at,
              COUNT(b.id) FILTER (WHERE b.event_type='payment')  AS payment_count,
              SUM(b.amount_cents) FILTER (WHERE b.event_type='payment') AS total_paid_cents,
              SUM(b.net_cents)    FILTER (WHERE b.event_type='payment') AS total_net_cents
       FROM mwt_customers c
       LEFT JOIN mwt_billing_events b ON b.customer_id = c.id
       WHERE c.deleted_at IS NULL
       GROUP BY c.id ORDER BY c.created_at DESC`
    );
    res.json(rows);
  });

  r.get('/:id/events', async (req, res) => {
    const { rows } = await pool.query(
      `SELECT * FROM mwt_billing_events WHERE customer_id=$1 ORDER BY created_at DESC`,
      [req.params.id]
    );
    res.json(rows);
  });

  // ── OSS quarterly report ─────────────────────────────────────────────────
  // Returns data ready to enter into the Belastingdienst OSS portal.
  // Also shows whether you're below/above the €10k threshold.
  r.get('/oss-report', async (req, res) => {
    const year    = Number(req.query.year)    || new Date().getFullYear();
    const quarter = Number(req.query.quarter) || Math.ceil((new Date().getMonth() + 1) / 3);

    const { rows } = await pool.query(
      `SELECT * FROM mwt_oss_quarterly WHERE year = $1 AND quarter = $2`,
      [year, quarter]
    );

    // Cross-border total (everything except NL)
    const crossBorderNetCents = rows
      .filter(r => r.country_code !== 'NL')
      .reduce((s: number, r: any) => s + Number(r.net_cents || 0), 0);

    const belowThreshold = crossBorderNetCents < OSS_THRESHOLD_CENTS / 4; // per quarter

    res.json({
      year, quarter,
      cross_border_net_cents: crossBorderNetCents,
      oss_threshold_cents:    OSS_THRESHOLD_CENTS,
      below_threshold:        belowThreshold,
      note: belowThreshold
        ? 'Below €10,000 annual threshold — NL 21% rate applies to all sales this quarter. Still register for OSS to track.'
        : 'Above threshold — OSS rates apply. Enter figures below into Belastingdienst OSS portal.',
      by_country: rows,
    });
  });

  // ── UK VAT quarterly summary (for HMRC filing) ──────────────────────────
  r.get('/uk-vat-report', async (req, res) => {
    const year    = Number(req.query.year)    || new Date().getFullYear();
    const quarter = Number(req.query.quarter) || Math.ceil((new Date().getMonth() + 1) / 3);
    const { rows } = await pool.query(
      `SELECT * FROM mwt_uk_vat_quarterly WHERE year = $1 AND quarter = $2`,
      [year, quarter]
    );
    const row = rows[0] || { net_cents: 0, vat_cents: 0, gross_cents: 0, transaction_count: 0 };
    res.json({
      year, quarter,
      vat_rate_pct: 20,
      ...row,
      note: 'File via HMRC Making Tax Digital (MTD) VAT portal. UK VAT returns are quarterly.',
    });
  });

  // ── ROW revenue summary (informational — no filing obligation yet) ────────
  r.get('/row-revenue', async (req, res) => {
    const year    = Number(req.query.year)    || new Date().getFullYear();
    const quarter = Number(req.query.quarter) || Math.ceil((new Date().getMonth() + 1) / 3);
    const { rows } = await pool.query(
      `SELECT * FROM mwt_row_revenue_quarterly WHERE year = $1 AND quarter = $2`,
      [year, quarter]
    );
    const total = rows.reduce((s: number, r: any) => s + Number(r.gross_cents || 0), 0);
    res.json({
      year, quarter,
      total_gross_cents: total,
      by_country: rows,
      note: 'No tax collected from ROW customers yet. Integrate Stripe Tax before significant US/CA/Asia volume. US nexus threshold: $100k or 200 transactions per state.',
    });
  });

  // ── Cancellation (14-day cooling-off + voluntary) ────────────────────────
  r.post('/:id/cancel', async (req, res) => {
    const { reason } = req.body || {};

    // Fetch customer + most recent payment event (need order ID for potential refund)
    const { rows: [customer] } = await pool.query(
      `SELECT c.*,
              b.created_at              AS last_payment_at,
              b.product                 AS last_product,
              b.amount_cents            AS last_amount_cents,
              b.currency                AS last_currency,
              b.multisafepay_order_id   AS last_order_id
       FROM mwt_customers c
       LEFT JOIN mwt_billing_events b
         ON b.customer_id = c.id AND b.event_type = 'payment'
       WHERE c.id = $1 AND c.deleted_at IS NULL
       ORDER BY b.created_at DESC LIMIT 1`,
      [req.params.id]
    );
    if (!customer) { res.status(404).json({ error: 'not found' }); return; }

    const isCoolingOff =
      customer.last_payment_at &&
      Date.now() - new Date(customer.last_payment_at).getTime() < COOLING_OFF_MS;

    const { rows: [{ n }] } = await pool.query(`SELECT nextval('mwt_invoice_seq') AS n`);
    const refNum = `MWT-CANCEL-${new Date().getFullYear()}-${String(n).padStart(6,'0')}`;

    // Issue refund via MultiSafepay if within cooling-off window
    let refundIssued = false;
    if (isCoolingOff && customer.last_order_id && customer.last_amount_cents > 0) {
      refundIssued = await mspRefund(
        customer.last_order_id,
        customer.last_amount_cents,
        customer.last_currency || 'EUR',
        `14-day cooling-off withdrawal — ${refNum}`,
      );
    }

    await pool.query(
      `INSERT INTO mwt_billing_events
         (customer_id, event_type, product, amount_cents, currency, vat_cents, vat_rate,
          vat_country, net_cents, tax_region, invoice_number, description)
       VALUES ($1,'cancellation',$2,0,'EUR',0,0,$3,0,'EU',$4,$5)`,
      [
        customer.id,
        customer.tier,
        customer.country_code || 'NL',
        refNum,
        isCoolingOff
          ? `14-day cooling-off (refund ${refundIssued ? 'issued' : 'PENDING — check MSP'}): ${reason || ''}`
          : `Voluntary cancel: ${reason || ''}`,
      ]
    );

    await pool.query(`UPDATE mwt_customers SET tier='pigeon' WHERE id=$1`, [customer.id]);

    sendCancellationConfirmation({
      to:            customer.email,
      refNumber:     refNum,
      tier:          customer.last_product || customer.tier,
      isCoolingOff,
      refundIssued,
      effectiveDate: new Date().toISOString().slice(0, 10),
    }).catch(() => {});

    res.json({ ok: true, ref: refNum, cooling_off: isCoolingOff, refund_issued: refundIssued });
  });

  // Manual tier override
  r.post('/:id/tier', async (req, res) => {
    const { tier } = req.body;
    const valid = ['pigeon','tits','flock_of_geese','sustainability','business'];
    if (!valid.includes(tier)) { res.status(400).json({ error: 'invalid tier' }); return; }
    await pool.query(`UPDATE mwt_customers SET tier=$1 WHERE id=$2`, [tier, req.params.id]);
    res.json({ ok: true });
  });

  return r;
}
