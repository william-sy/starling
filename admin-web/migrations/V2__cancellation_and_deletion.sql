-- 14-day cooling-off tracking
ALTER TABLE mwt_billing_events
  ADD COLUMN IF NOT EXISTS cancelled_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_cooling_off BOOLEAN NOT NULL DEFAULT FALSE;

-- Immutable audit log of account deletions.
-- Billing records are retained on mwt_customers (soft-delete) for 7-year EU tax obligation,
-- but all relay data (messages, device list, prekeys) is purged at deletion time.
CREATE TABLE IF NOT EXISTS mwt_account_deletions (
  id             BIGSERIAL PRIMARY KEY,
  account_pin    TEXT        NOT NULL,
  customer_id    BIGINT      REFERENCES mwt_customers(id),   -- NULL if never paid
  requested_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  initiated_by   TEXT        NOT NULL,   -- 'user_self' | 'admin' | 'gdpr_erasure'
  relay_purged   BOOLEAN     NOT NULL DEFAULT FALSE,
  billing_email  TEXT,                  -- copied at deletion time for confirmation email
  notes          TEXT
);

-- Index for compliance queries ("show all deletions for PIN X")
CREATE INDEX IF NOT EXISTS mwt_account_deletions_pin_idx ON mwt_account_deletions (account_pin);
