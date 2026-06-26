-- mwt admin schema
-- Shares the same Postgres instance as the tax portal (tax_* tables).
-- All billing events kept 7 years per EU tax law (Art. 52 VAT Directive).

CREATE TABLE IF NOT EXISTS mwt_customers (
  id          SERIAL PRIMARY KEY,
  -- PIN is our only link to the mwt account. We store no message data.
  account_pin VARCHAR(20)  NOT NULL UNIQUE,
  -- Email stored only for billing/legal — never used for marketing without consent.
  email       VARCHAR(200) NOT NULL,
  tier        VARCHAR(50)  NOT NULL DEFAULT 'pigeon',
  -- 'pigeon','tits','flock_of_geese','sustainability','business'
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  deleted_at  TIMESTAMPTZ  -- soft-delete on GDPR erasure request completion
);

CREATE TABLE IF NOT EXISTS mwt_billing_events (
  id                    SERIAL PRIMARY KEY,
  customer_id           INTEGER      NOT NULL REFERENCES mwt_customers(id),
  event_type            VARCHAR(50)  NOT NULL,
  -- 'payment','refund','chargeback','tier_change','one_time_purchase'
  product               VARCHAR(100) NOT NULL,
  -- 'tits','flock_of_geese','sustainability_monthly','business_monthly','gif_unlock'
  amount_cents          INTEGER      NOT NULL DEFAULT 0,
  currency              VARCHAR(3)   NOT NULL DEFAULT 'EUR',
  vat_cents             INTEGER      NOT NULL DEFAULT 0,
  vat_rate              VARCHAR(10)  NOT NULL DEFAULT '21',
  multisafepay_order_id VARCHAR(200),
  multisafepay_status   VARCHAR(50),
  invoice_number        VARCHAR(100) UNIQUE,
  description           TEXT,
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  -- 7 years from transaction date (EU tax retention requirement)
  retention_until       DATE         NOT NULL GENERATED ALWAYS AS
                          ((created_at::date + INTERVAL '7 years')::date) STORED,
  -- link to tax_documents for the actual invoice PDF once generated
  tax_document_id       INTEGER REFERENCES tax_documents(id) ON DELETE SET NULL
);

CREATE INDEX ON mwt_billing_events (customer_id);
CREATE INDEX ON mwt_billing_events (multisafepay_order_id);
CREATE INDEX ON mwt_billing_events (created_at);

-- GDPR law: respond within 30 days (Art. 12 GDPR)
CREATE TABLE IF NOT EXISTS mwt_gdpr_requests (
  id           SERIAL PRIMARY KEY,
  request_type VARCHAR(50)  NOT NULL,
  -- 'erasure','portability','access','rectification','restriction'
  account_pin  VARCHAR(20),
  email        VARCHAR(200) NOT NULL,
  status       VARCHAR(50)  NOT NULL DEFAULT 'pending',
  -- 'pending','in_progress','completed','rejected'
  received_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  due_at       TIMESTAMPTZ  NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
  completed_at TIMESTAMPTZ,
  handler      VARCHAR(200),
  notes        TEXT
);

CREATE INDEX ON mwt_gdpr_requests (status, due_at);

-- Versioned legal pages — every published version kept permanently
-- (needed to prove what a user agreed to at signup)
CREATE TABLE IF NOT EXISTS mwt_legal_pages (
  id           SERIAL PRIMARY KEY,
  page_type    VARCHAR(50)  NOT NULL,
  -- 'terms_of_service','privacy_policy','age_gate_text'
  version      VARCHAR(20)  NOT NULL,
  content_md   TEXT         NOT NULL,
  effective_at DATE         NOT NULL,
  published_by VARCHAR(200),
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (page_type, version)
);

-- Transactional email log — for billing receipts, GDPR confirmations
CREATE TABLE IF NOT EXISTS mwt_email_log (
  id           SERIAL PRIMARY KEY,
  customer_id  INTEGER      REFERENCES mwt_customers(id) ON DELETE SET NULL,
  to_email     VARCHAR(200) NOT NULL,
  subject      VARCHAR(500) NOT NULL,
  template     VARCHAR(100) NOT NULL,
  brevo_msg_id VARCHAR(200),
  status       VARCHAR(50)  NOT NULL DEFAULT 'sent',
  -- 'sent','delivered','bounced','failed'
  sent_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Invoice number sequence — format: MWT-YYYY-NNNNNN
CREATE SEQUENCE IF NOT EXISTS mwt_invoice_seq START 1;
