-- Customer tax identifiers and sales-tax display. Does not rewrite earlier migrations.
-- ATL and FBR/IRIS connections are not part of this migration.

ALTER TABLE customers
  ADD COLUMN tax_country_code text,
  ADD COLUMN party_type text,
  ADD COLUMN cnic_ntn text,
  ADD COLUMN ntn_check_digit text,
  ADD COLUMN strn text,
  ADD CONSTRAINT customers_tax_country_code_check
    CHECK (tax_country_code IS NULL OR tax_country_code ~ '^[A-Z]{2}$'),
  ADD CONSTRAINT customers_party_type_check
    CHECK (party_type IS NULL OR party_type IN ('individual', 'company', 'aop')),
  ADD CONSTRAINT customers_cnic_ntn_check CHECK (
    cnic_ntn IS NULL
    OR (party_type = 'individual' AND cnic_ntn ~ '^[0-9]{13}$' AND ntn_check_digit IS NULL)
    OR (
      party_type IN ('company', 'aop')
      AND cnic_ntn ~ '^[0-9]{7}$'
      AND (ntn_check_digit IS NULL OR ntn_check_digit ~ '^[0-9]$')
    )
  );

COMMENT ON COLUMN customers.tax_identifier IS
  'Generic tax identifier. Not classified as a CNIC or NTN.';
COMMENT ON COLUMN customers.cnic_ntn IS
  'Canonical digits only: 13-digit CNIC for an individual, or 7-digit NTN for a company or AOP.';
COMMENT ON COLUMN customers.ntn_check_digit IS
  'Optional printed NTN check digit. Stored for display. Not verified.';

ALTER TABLE sales_settings
  ADD COLUMN show_customer_tax_identifiers boolean NOT NULL DEFAULT false;

ALTER TABLE invoices
  ADD COLUMN snapshot_tax_country_code text,
  ADD COLUMN snapshot_tax_identifier text,
  ADD COLUMN snapshot_party_type text,
  ADD COLUMN snapshot_cnic_ntn text,
  ADD COLUMN snapshot_ntn_check_digit text,
  ADD COLUMN snapshot_strn text,
  ADD CONSTRAINT invoices_snapshot_tax_country_check
    CHECK (snapshot_tax_country_code IS NULL OR snapshot_tax_country_code ~ '^[A-Z]{2}$'),
  ADD CONSTRAINT invoices_snapshot_party_type_check
    CHECK (snapshot_party_type IS NULL OR snapshot_party_type IN ('individual', 'company', 'aop'));
