-- Country-level feature flag for paid tier availability.
-- App checks this before showing any purchase UI.
-- Defaults: EU + UK paid-available at launch, everything else free-only.
CREATE TABLE IF NOT EXISTS mwt_country_availability (
  country_code   CHAR(2)      PRIMARY KEY,
  paid_available BOOLEAN      NOT NULL DEFAULT FALSE,
  launch_date    DATE,                          -- planned date, shown to waitlist
  notes          TEXT,
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_by     TEXT
);

-- EU countries: paid available at launch (OSS handles VAT)
INSERT INTO mwt_country_availability (country_code, paid_available, notes)
  SELECT country_code, TRUE, 'EU — OSS VAT covered'
  FROM mwt_eu_vat_rates
  WHERE country_code <> 'GB'    -- GB inserted separately below
ON CONFLICT (country_code) DO NOTHING;

-- UK: paid available (HMRC VAT covered)
INSERT INTO mwt_country_availability (country_code, paid_available, notes)
  VALUES ('GB', TRUE, 'UK — HMRC VAT covered')
ON CONFLICT (country_code) DO NOTHING;

-- Common ROW countries pre-seeded as free-only with placeholder launch dates.
-- Update launch_date when you register for VAT / choose a MoR in that region.
INSERT INTO mwt_country_availability (country_code, paid_available, notes) VALUES
  ('US', FALSE, 'ROW — no US sales tax collected yet; enable after Stripe Tax integration'),
  ('CA', FALSE, 'ROW — below CAD $30k GST threshold'),
  ('AU', FALSE, 'ROW — below AUD $75k GST threshold'),
  ('NZ', FALSE, 'ROW — below NZD $60k GST threshold'),
  ('JP', FALSE, 'ROW — below JPY 10M JCT threshold'),
  ('SG', FALSE, 'ROW — below SGD $1M GST threshold'),
  ('KR', FALSE, 'ROW — KR VAT registration needed'),
  ('IN', FALSE, 'ROW — IN GST registration needed'),
  ('BR', FALSE, 'ROW — BR tax too complex without local entity'),
  ('CN', FALSE, 'ROW — requires local entity; out of scope'),
  ('MX', FALSE, 'ROW — MX VAT registration needed'),
  ('ZA', FALSE, 'ROW — ZA VAT registration needed')
ON CONFLICT (country_code) DO NOTHING;

-- Waitlist: interest registration when paid not yet available.
-- On country launch, admin triggers a notify run that bulk-emails all entries.
CREATE TABLE IF NOT EXISTS mwt_waitlist (
  id           BIGSERIAL    PRIMARY KEY,
  email        TEXT         NOT NULL,
  country_code CHAR(2)      NOT NULL,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  notified_at  TIMESTAMPTZ,                     -- set when launch email sent
  UNIQUE (email, country_code)
);

CREATE INDEX IF NOT EXISTS mwt_waitlist_country_idx ON mwt_waitlist (country_code);
