-- Fix vat_rate column: V1 declared it VARCHAR(10), needs to be INTEGER for joins.
ALTER TABLE mwt_billing_events
  ALTER COLUMN vat_rate TYPE INTEGER USING vat_rate::INTEGER;
