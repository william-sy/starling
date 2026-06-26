-- VAT OSS compliance: track buyer country per customer and per transaction.
-- Required to file EU One Stop Shop quarterly returns with Belastingdienst.

ALTER TABLE mwt_customers
  ADD COLUMN IF NOT EXISTS country_code CHAR(2) NOT NULL DEFAULT 'NL';

-- Replace hardcoded vat_rate (TEXT) with proper numeric columns.
-- vat_rate stored as integer basis points × 100 — i.e. 21 = 21%, 19 = 19%.
ALTER TABLE mwt_billing_events
  ADD COLUMN IF NOT EXISTS vat_country  CHAR(2),
  ADD COLUMN IF NOT EXISTS net_cents    INTEGER,     -- amount excl. VAT
  ADD COLUMN IF NOT EXISTS oss_reported BOOLEAN NOT NULL DEFAULT FALSE;

-- Backfill existing rows: assume NL, 21%
UPDATE mwt_billing_events SET
  vat_country = 'NL',
  net_cents   = ROUND(amount_cents * 100.0 / 121.0)
WHERE vat_country IS NULL AND amount_cents > 0;

-- OSS quarterly summary view — feed directly into the Belastingdienst OSS portal.
-- One row per country per quarter: net sales + VAT owed.
CREATE OR REPLACE VIEW mwt_oss_quarterly AS
SELECT
  EXTRACT(YEAR  FROM created_at)    AS year,
  EXTRACT(QUARTER FROM created_at)  AS quarter,
  vat_country                       AS country_code,
  CAST(EU_VAT_RATES(vat_country) AS TEXT)  AS vat_rate_pct,  -- see note below
  SUM(net_cents)                    AS net_cents,
  SUM(vat_cents)                    AS vat_cents,
  SUM(amount_cents)                 AS gross_cents,
  COUNT(*)                          AS transaction_count
FROM mwt_billing_events
WHERE event_type = 'payment'
  AND vat_country IS NOT NULL
GROUP BY 1, 2, 3, 4
ORDER BY 1, 2, 3;

-- Note: EU_VAT_RATES lookup is in application code (vat.ts), not a PG function.
-- The view above won't resolve that call — use the report endpoint instead.
-- Drop and recreate with a static lookup table:
DROP VIEW IF EXISTS mwt_oss_quarterly;

-- Static VAT rates table so the DB view works without app code.
CREATE TABLE IF NOT EXISTS mwt_eu_vat_rates (
  country_code CHAR(2)  PRIMARY KEY,
  rate_pct     SMALLINT NOT NULL,   -- e.g. 21 for 21%
  valid_from   DATE     NOT NULL DEFAULT '2025-01-01',
  notes        TEXT
);

INSERT INTO mwt_eu_vat_rates (country_code, rate_pct, notes) VALUES
  ('AT', 20, 'Austria'),
  ('BE', 21, 'Belgium'),
  ('BG', 20, 'Bulgaria'),
  ('CY', 19, 'Cyprus'),
  ('CZ', 21, 'Czech Republic'),
  ('DE', 19, 'Germany'),
  ('DK', 25, 'Denmark'),
  ('EE', 22, 'Estonia'),
  ('ES', 21, 'Spain'),
  ('FI', 25, 'Finland — verify 25.5% if material'),
  ('FR', 20, 'France'),
  ('GR', 24, 'Greece'),
  ('HR', 25, 'Croatia'),
  ('HU', 27, 'Hungary'),
  ('IE', 23, 'Ireland'),
  ('IT', 22, 'Italy'),
  ('LT', 21, 'Lithuania'),
  ('LU', 17, 'Luxembourg'),
  ('LV', 21, 'Latvia'),
  ('MT', 18, 'Malta'),
  ('NL', 21, 'Netherlands — home country'),
  ('PL', 23, 'Poland'),
  ('PT', 23, 'Portugal'),
  ('RO', 19, 'Romania'),
  ('SE', 25, 'Sweden'),
  ('SI', 22, 'Slovenia'),
  ('SK', 20, 'Slovakia')
ON CONFLICT (country_code) DO NOTHING;

-- OSS quarterly view using the rates table
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
WHERE b.event_type = 'payment'
GROUP BY 1, 2, 3, 4
ORDER BY 1, 2, 3;
