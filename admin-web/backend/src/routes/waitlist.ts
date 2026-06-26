'use strict';
import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import nodemailer from 'nodemailer';

const FROM = process.env.EMAIL_FROM || 'billing@mwt.app';

const transporter = nodemailer.createTransport(
  process.env.BREVO_SMTP_KEY
    ? { host: 'smtp-relay.brevo.com', port: 587,
        auth: { user: process.env.BREVO_SMTP_LOGIN!, pass: process.env.BREVO_SMTP_KEY! } }
    : { jsonTransport: true }
);

// ── Public — register interest ────────────────────────────────────────────────
// POST /api/mwt/waitlist  { email, country_code }
// Called by the app when user taps "Register interest" on the free-only banner.
export function createPublicWaitlistRouter(pool: Pool): Router {
  const r = Router();

  r.post('/', async (req: Request, res: Response) => {
    const { email, country_code } = req.body || {};
    if (!email || !country_code) { res.status(400).json({ error: 'email and country_code required' }); return; }

    const cc = String(country_code).toUpperCase().slice(0, 2);

    // Silently succeed on duplicate — don't leak whether email is registered
    await pool.query(
      `INSERT INTO mwt_waitlist (email, country_code)
       VALUES ($1, $2)
       ON CONFLICT (email, country_code) DO NOTHING`,
      [email.toLowerCase().trim(), cc]
    );

    // Confirmation email
    transporter.sendMail({
      from: FROM,
      to:   email,
      subject: `You're on the mwt waitlist for ${cc}`,
      text: [
        `Thanks for your interest in mwt — messages with trust.`,
        ``,
        `Paid plans aren't available in ${cc} yet, but you're on the list.`,
        `We'll email you the moment they go live.`,
        ``,
        `In the meantime, the free Pigeon tier is fully available — private,`,
        `end-to-end encrypted messaging with no ads and no data selling.`,
        ``,
        `mwt — messages with trust`,
      ].join('\n'),
    }).catch(() => {});

    res.json({ ok: true });
  });

  return r;
}

// ── Admin — view and notify waitlist ─────────────────────────────────────────
export function createAdminWaitlistRouter(pool: Pool): Router {
  const r = Router();

  // All waitlist entries, grouped by country
  r.get('/', async (_req, res) => {
    const { rows } = await pool.query(
      `SELECT country_code, COUNT(*) AS total,
              COUNT(*) FILTER (WHERE notified_at IS NOT NULL) AS notified,
              COUNT(*) FILTER (WHERE notified_at IS NULL)     AS pending,
              MIN(created_at) AS first_signup,
              MAX(created_at) AS last_signup
       FROM mwt_waitlist
       GROUP BY country_code
       ORDER BY pending DESC, country_code`
    );
    res.json(rows);
  });

  // Entries for a specific country
  r.get('/:code', async (req, res) => {
    const { rows } = await pool.query(
      `SELECT * FROM mwt_waitlist WHERE country_code=$1 ORDER BY created_at DESC`,
      [req.params.code.toUpperCase()]
    );
    res.json(rows);
  });

  // Notify the entire waitlist for a country that paid is now live.
  // Typically called after flipping paid_available=true for that country.
  // Safe to run multiple times — only notifies unnotified entries.
  r.post('/:code/notify', async (req: Request, res: Response) => {
    const cc = req.params.code.toUpperCase();

    // Get country availability to confirm it's actually live now
    const { rows: [flag] } = await pool.query(
      `SELECT paid_available FROM mwt_country_availability WHERE country_code=$1`, [cc]
    );
    if (!flag?.paid_available) {
      res.status(400).json({ error: `${cc} is not yet marked as paid_available — flip the flag first` });
      return;
    }

    const { rows: entries } = await pool.query(
      `SELECT id, email FROM mwt_waitlist
       WHERE country_code=$1 AND notified_at IS NULL`,
      [cc]
    );

    if (entries.length === 0) { res.json({ ok: true, notified: 0 }); return; }

    let sent = 0;
    for (const entry of entries) {
      try {
        await transporter.sendMail({
          from: FROM,
          to:   entry.email,
          subject: `mwt paid plans are now available in ${cc}!`,
          text: [
            `Great news — mwt paid plans are now available in ${cc}.`,
            ``,
            `You signed up to be notified, and here we are.`,
            ``,
            `Open the mwt app and head to Settings → Upgrade to see the available plans.`,
            ``,
            `mwt — messages with trust`,
          ].join('\n'),
          html: launchEmailHtml(cc),
        });
        await pool.query(
          `UPDATE mwt_waitlist SET notified_at=NOW() WHERE id=$1`, [entry.id]
        );
        sent++;
      } catch {
        // Continue — don't let one bad address block the rest
      }
    }

    res.json({ ok: true, notified: sent, total: entries.length });
  });

  return r;
}

function launchEmailHtml(cc: string): string {
  return `<!doctype html><html><body style="font-family:sans-serif;max-width:480px;margin:40px auto;color:#222">
<h2 style="color:#1a7a3c">mwt paid plans are live in ${cc}!</h2>
<p>You signed up to be notified — and here we are.</p>
<p>Open the <b>mwt app</b> → Settings → Upgrade to see available plans.</p>
<p style="margin-top:24px">
  All paid plans include end-to-end encrypted messaging, voice calls, and more —
  with no ads, no data selling, and no backdoors.
</p>
<p style="color:#666;font-size:13px;margin-top:32px">mwt — messages with trust</p>
</body></html>`;
}
