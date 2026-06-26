'use strict';

// ── Tax regions ───────────────────────────────────────────────────────────────
// How tax is handled differs by region, not just rate.
// EU:  OSS — collect buyer-country VAT, file quarterly via Belastingdienst
// UK:  HMRC — 20% flat, separate registration, separate filing
// ROW: No collection until nexus thresholds reached. When scaling, route
//      through Stripe Tax (automated nexus tracking) or a Merchant of Record
//      (Paddle/LemonSqueezy — they own the tax liability entirely).
export type TaxRegion = 'EU' | 'UK' | 'ROW';

export function taxRegion(country_code: string): TaxRegion {
  const cc = country_code.toUpperCase();
  if (cc in EU_VAT_RATES) return 'EU';
  if (cc === 'GB')         return 'UK';
  return 'ROW';
}

// ── EU VAT rates for digital services (B2C), 2025 ───────────────────────────
// Source: European Commission VAT rates database.
// Standard rates only — reduced rates don't apply to messaging SaaS.
export const EU_VAT_RATES: Record<string, number> = {
  AT: 20, BE: 21, BG: 20, CY: 19, CZ: 21,
  DE: 19, DK: 25, EE: 22, ES: 21, FI: 25, // FI is 25.5% — round up if material
  FR: 20, GR: 24, HR: 25, HU: 27, IE: 23,
  IT: 22, LT: 21, LU: 17, LV: 21, MT: 18,
  NL: 21, PL: 23, PT: 23, RO: 19, SE: 25,
  SI: 22, SK: 20,
};

// UK VAT — flat rate, separate HMRC registration from EU OSS
export const UK_VAT_RATE = 20;

// EU OSS threshold — below this, NL 21% applies to all cross-border EU sales
export const OSS_THRESHOLD_CENTS = 10_000 * 100; // €10,000/year

// ── VatResult ─────────────────────────────────────────────────────────────────
export interface VatResult {
  country_code:    string;
  tax_region:      TaxRegion;
  vat_rate:        number;   // e.g. 20 — zero for ROW (no collection)
  vat_cents:       number;
  net_cents:       number;
  gross_cents:     number;
  is_home_country: boolean;
  // For ROW: note that local tax may be owed by the buyer — not collected by us yet.
  // Integrate Stripe Tax or a MoR (Paddle) before scaling into US/CA/Asia.
  row_tax_note?:   string;
}

/**
 * Calculate tax for a B2C digital service sale.
 * gross_cents is the VAT-inclusive price the customer paid.
 *
 * EU:  Extract correct country VAT from gross
 * UK:  Extract 20% UK VAT from gross
 * ROW: No tax collected — full gross is net. Flag for future Stripe Tax integration.
 */
export function calcVat(gross_cents: number, country_code: string): VatResult {
  const cc     = country_code.toUpperCase() || 'NL';
  const region = taxRegion(cc);

  let rate: number;
  let row_tax_note: string | undefined;

  if (region === 'EU') {
    rate = EU_VAT_RATES[cc] ?? EU_VAT_RATES['NL'];
  } else if (region === 'UK') {
    rate = UK_VAT_RATE;
  } else {
    rate = 0;
    row_tax_note =
      'No tax collected — buyer may owe local sales tax. ' +
      'Integrate Stripe Tax before significant ROW volume.';
  }

  const vat_cents = rate > 0 ? Math.round(gross_cents * rate / (100 + rate)) : 0;
  const net_cents = gross_cents - vat_cents;

  return {
    country_code:    cc,
    tax_region:      region,
    vat_rate:        rate,
    vat_cents,
    net_cents,
    gross_cents,
    is_home_country: cc === 'NL',
    row_tax_note,
  };
}

/**
 * Determine buyer country from MultiSafepay webhook.
 * Billing address country + IP address = two pieces of evidence (EU requirement).
 */
export function countryFromMspWebhook(body: any): string {
  return (body?.customer?.country || 'NL').toUpperCase();
}

// ── Human-readable region label (for receipts and admin UI) ──────────────────
export function taxLabel(result: VatResult): string {
  if (result.tax_region === 'EU') return `EU VAT ${result.vat_rate}% (OSS)`;
  if (result.tax_region === 'UK') return `UK VAT ${result.vat_rate}% (HMRC)`;
  return 'No tax collected';
}
