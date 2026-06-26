-- Add UK VAT and tax_region tracking.
-- ROW (rest of world) = no collection yet — integrate Stripe Tax before scaling.

ALTER TABLE mwt_billing_events
  ADD COLUMN IF NOT EXISTS tax_region TEXT NOT NULL DEFAULT 'EU'
    CHECK (tax_region IN ('EU', 'UK', 'ROW'));

-- UK in the rates table so the OSS view can join cleanly
-- (UK rows are excluded from OSS report but use the same rates table)
INSERT INTO mwt_eu_vat_rates (country_code, rate_pct, notes)
  VALUES ('GB', 20, 'UK VAT — HMRC registration, NOT part of EU OSS filing')
ON CONFLICT (country_code) DO NOTHING;

-- Update OSS view to exclude UK and ROW (OSS is EU-only)
CREATE OR REPLACE VIEW mwt_oss_quarterly AS
SELECT
  EXTRACT(YEAR    FROM b.created_at)::INT  AS year,
  EXTRACT(QUARTER FROM b.created_at)::INT  AS quarter,
  b.vat_country                            AS country_code,
  v.rate_pct                               AS vat_rate_pct,
  SUM(b.net_cents)                         AS net_cents,
  SUM(b.vat_cents)                         AS vat_cents,
  SUM(b.amount_cents)                      AS gross_cents,
  COUNT(*)                                 AS transaction_count
FROM mwt_billing_events b
JOIN mwt_eu_vat_rates v ON v.country_code = b.vat_country
WHERE b.event_type  = 'payment'
  AND b.tax_region  = 'EU'          -- EU OSS only
GROUP BY 1, 2, 3, 4
ORDER BY 1, 2, 3;

-- Separate UK VAT summary view (for HMRC filing — annual or quarterly return)
CREATE OR REPLACE VIEW mwt_uk_vat_quarterly AS
SELECT
  EXTRACT(YEAR    FROM created_at)::INT  AS year,
  EXTRACT(QUARTER FROM created_at)::INT  AS quarter,
  SUM(net_cents)                         AS net_cents,
  SUM(vat_cents)                         AS vat_cents,
  SUM(amount_cents)                      AS gross_cents,
  COUNT(*)                               AS transaction_count
FROM mwt_billing_events
WHERE event_type  = 'payment'
  AND tax_region  = 'UK'
GROUP BY 1, 2
ORDER BY 1, 2;

-- ROW summary — informational, no filing obligation until nexus reached
CREATE OR REPLACE VIEW mwt_row_revenue_quarterly AS
SELECT
  EXTRACT(YEAR    FROM b.created_at)::INT  AS year,
  EXTRACT(QUARTER FROM b.created_at)::INT  AS quarter,
  b.vat_country                            AS country_code,
  SUM(b.amount_cents)                      AS gross_cents,
  COUNT(*)                                 AS transaction_count
FROM mwt_billing_events b
WHERE b.event_type = 'payment'
  AND b.tax_region = 'ROW'
GROUP BY 1, 2, 3
ORDER BY 1, 2, gross_cents DESC;
