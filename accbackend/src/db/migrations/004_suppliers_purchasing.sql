-- Phase 3 suppliers and purchasing. Does not rewrite earlier migrations.
-- Stock quantities, stock movements, inventory valuation, and cost of goods sold are not stored here.
-- A supplier bill posts to the product's purchase expense account and the tax code's purchase tax asset.
-- It does not post to an inventory asset.

ALTER TABLE journal_entries DROP CONSTRAINT journal_entries_source_type_check;
ALTER TABLE journal_entries ADD CONSTRAINT journal_entries_source_type_check
  CHECK (source_type IN (
    'manual', 'opening_balance', 'reversal',
    'invoice', 'receipt', 'receipt_allocation', 'customer_return',
    'supplier_bill', 'supplier_payment', 'supplier_payment_allocation', 'supplier_return'
  ));

ALTER TABLE products
  ADD COLUMN purchase_account_id uuid REFERENCES accounts(id) ON DELETE RESTRICT;

COMMENT ON COLUMN products.purchase_account_id IS
  'Expense account used by supplier bills. Not an inventory asset. Quantity on hand is Phase 4.';

CREATE TABLE purchasing_settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  tax_pricing_mode text NOT NULL DEFAULT 'exclusive' CHECK (tax_pricing_mode IN ('exclusive', 'inclusive')),
  discount_treatment text NOT NULL DEFAULT 'reduce_taxable_base' CHECK (discount_treatment IN ('reduce_taxable_base')),
  ap_control_account_id uuid REFERENCES accounts(id) ON DELETE RESTRICT,
  supplier_advance_account_id uuid REFERENCES accounts(id) ON DELETE RESTRICT,
  show_supplier_tax_identifiers boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO purchasing_settings (id, ap_control_account_id)
SELECT 1, id FROM accounts WHERE code = '2100'
UNION ALL
SELECT 1, NULL::uuid
WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE code = '2100')
  AND NOT EXISTS (SELECT 1 FROM purchasing_settings);

CREATE TABLE suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  legal_name text NOT NULL,
  display_name text NOT NULL,
  contact_name text,
  phone text,
  email text,
  tax_identifier text,
  tax_country_code text,
  party_type text,
  cnic_ntn text,
  ntn_check_digit text,
  strn text,
  payment_terms_days integer NOT NULL DEFAULT 0 CHECK (payment_terms_days >= 0),
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT suppliers_code_unique UNIQUE (code),
  CONSTRAINT suppliers_tax_country_code_check
    CHECK (tax_country_code IS NULL OR tax_country_code ~ '^[A-Z]{2}$'),
  CONSTRAINT suppliers_party_type_check
    CHECK (party_type IS NULL OR party_type IN ('individual', 'company', 'aop')),
  CONSTRAINT suppliers_cnic_ntn_check CHECK (
    cnic_ntn IS NULL
    OR (party_type = 'individual' AND cnic_ntn ~ '^[0-9]{13}$' AND ntn_check_digit IS NULL)
    OR (
      party_type IN ('company', 'aop')
      AND cnic_ntn ~ '^[0-9]{7}$'
      AND (ntn_check_digit IS NULL OR ntn_check_digit ~ '^[0-9]$')
    )
  )
);

COMMENT ON COLUMN suppliers.tax_identifier IS
  'Generic tax identifier. Not classified as a CNIC or NTN.';
COMMENT ON COLUMN suppliers.cnic_ntn IS
  'Canonical digits only: 13-digit CNIC for an individual, or 7-digit NTN for a company or AOP.';
COMMENT ON COLUMN suppliers.ntn_check_digit IS
  'Optional printed NTN check digit. Stored for display. Not verified.';

CREATE UNIQUE INDEX suppliers_code_lower_idx ON suppliers (lower(code));

CREATE TABLE supplier_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  address_type text NOT NULL CHECK (address_type IN ('billing', 'shipping', 'other')),
  line1 text NOT NULL,
  line2 text,
  city text,
  region text,
  postal_code text,
  country_code char(2) NOT NULL,
  is_primary boolean NOT NULL DEFAULT false
);

CREATE UNIQUE INDEX supplier_addresses_one_primary
  ON supplier_addresses (supplier_id) WHERE is_primary;

CREATE TABLE supplier_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  name text NOT NULL,
  role_title text,
  phone text,
  email text,
  is_primary boolean NOT NULL DEFAULT false
);

CREATE UNIQUE INDEX supplier_contacts_one_primary
  ON supplier_contacts (supplier_id) WHERE is_primary;

CREATE TABLE supplier_opening_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_line_id uuid NOT NULL REFERENCES journal_lines(id) ON DELETE CASCADE,
  supplier_id uuid NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  amount numeric(19,4) NOT NULL CHECK (amount <> 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX supplier_opening_details_line_idx ON supplier_opening_details (journal_line_id);
CREATE INDEX supplier_opening_details_supplier_idx ON supplier_opening_details (supplier_id);

CREATE TABLE product_suppliers (
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  supplier_id uuid NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  supplier_item_code text,
  purchase_price numeric(19,4) NOT NULL CHECK (purchase_price >= 0),
  lead_time_days integer NOT NULL DEFAULT 0 CHECK (lead_time_days >= 0),
  is_preferred boolean NOT NULL DEFAULT false,
  PRIMARY KEY (product_id, supplier_id)
);

CREATE UNIQUE INDEX product_suppliers_one_preferred
  ON product_suppliers (product_id) WHERE is_preferred;
CREATE INDEX product_suppliers_supplier_idx ON product_suppliers (supplier_id);

CREATE TABLE supplier_bills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_number text NOT NULL UNIQUE,
  supplier_id uuid NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  status text NOT NULL CHECK (status IN ('draft', 'submitted', 'approved', 'posted', 'rejected', 'void', 'reversed')),
  bill_date date NOT NULL,
  due_date date NOT NULL,
  payment_terms_days integer NOT NULL CHECK (payment_terms_days >= 0),
  due_date_overridden boolean NOT NULL DEFAULT false,
  tax_pricing_mode text NOT NULL CHECK (tax_pricing_mode IN ('exclusive', 'inclusive')),
  discount_treatment text NOT NULL CHECK (discount_treatment IN ('reduce_taxable_base')),
  notes text,
  taxable_total numeric(19,4) NOT NULL DEFAULT 0,
  tax_total numeric(19,4) NOT NULL DEFAULT 0,
  total numeric(19,4) NOT NULL DEFAULT 0,
  journal_entry_id uuid REFERENCES journal_entries(id) ON DELETE RESTRICT,
  snapshot_tax_country_code text,
  snapshot_tax_identifier text,
  snapshot_party_type text,
  snapshot_cnic_ntn text,
  snapshot_ntn_check_digit text,
  snapshot_strn text,
  created_by uuid NOT NULL REFERENCES users(id),
  submitted_at timestamptz,
  submitted_by uuid REFERENCES users(id),
  approved_at timestamptz,
  approved_by uuid REFERENCES users(id),
  posted_at timestamptz,
  posted_by uuid REFERENCES users(id),
  voided_at timestamptz,
  voided_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT supplier_bills_snapshot_tax_country_check
    CHECK (snapshot_tax_country_code IS NULL OR snapshot_tax_country_code ~ '^[A-Z]{2}$'),
  CONSTRAINT supplier_bills_snapshot_party_type_check
    CHECK (snapshot_party_type IS NULL OR snapshot_party_type IN ('individual', 'company', 'aop'))
);

CREATE INDEX supplier_bills_supplier_idx ON supplier_bills (supplier_id, bill_date DESC);
CREATE INDEX supplier_bills_status_idx ON supplier_bills (status, bill_date DESC);

CREATE TABLE supplier_bill_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_bill_id uuid NOT NULL REFERENCES supplier_bills(id) ON DELETE CASCADE,
  line_no integer NOT NULL CHECK (line_no > 0),
  product_id uuid REFERENCES products(id) ON DELETE RESTRICT,
  description text NOT NULL,
  quantity numeric(19,4) NOT NULL CHECK (quantity > 0),
  unit_id uuid REFERENCES units(id) ON DELETE RESTRICT,
  unit_factor numeric(19,6) NOT NULL DEFAULT 1 CHECK (unit_factor > 0),
  unit_price numeric(19,4) NOT NULL CHECK (unit_price >= 0),
  discount_amount numeric(19,4) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  discount_treatment text NOT NULL,
  tax_code_id uuid REFERENCES tax_codes(id) ON DELETE RESTRICT,
  tax_pricing_mode text NOT NULL,
  tax_rate numeric(8,4) NOT NULL DEFAULT 0 CHECK (tax_rate >= 0 AND tax_rate <= 100),
  taxable_base numeric(19,4) NOT NULL DEFAULT 0,
  tax_amount numeric(19,4) NOT NULL DEFAULT 0,
  line_total numeric(19,4) NOT NULL DEFAULT 0,
  purchase_account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  tax_account_id uuid REFERENCES accounts(id) ON DELETE RESTRICT,
  UNIQUE (supplier_bill_id, line_no)
);

CREATE INDEX supplier_bill_lines_bill_idx ON supplier_bill_lines (supplier_bill_id);

CREATE TABLE supplier_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_number text NOT NULL UNIQUE,
  supplier_id uuid NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  status text NOT NULL CHECK (status IN ('draft', 'submitted', 'approved', 'posted', 'rejected', 'void', 'reversed')),
  payment_date date NOT NULL,
  cash_account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  amount numeric(19,4) NOT NULL CHECK (amount > 0),
  unallocated_amount numeric(19,4) NOT NULL DEFAULT 0 CHECK (unallocated_amount >= 0),
  ap_treatment text NOT NULL CHECK (ap_treatment IN ('direct_ap', 'supplier_advance')),
  advance_account_id uuid REFERENCES accounts(id) ON DELETE RESTRICT,
  notes text,
  journal_entry_id uuid REFERENCES journal_entries(id) ON DELETE RESTRICT,
  created_by uuid NOT NULL REFERENCES users(id),
  submitted_at timestamptz,
  submitted_by uuid REFERENCES users(id),
  approved_at timestamptz,
  approved_by uuid REFERENCES users(id),
  posted_at timestamptz,
  posted_by uuid REFERENCES users(id),
  voided_at timestamptz,
  voided_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX supplier_payments_supplier_idx ON supplier_payments (supplier_id, payment_date DESC);

CREATE TABLE supplier_payment_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_payment_id uuid NOT NULL REFERENCES supplier_payments(id) ON DELETE CASCADE,
  supplier_bill_id uuid NOT NULL REFERENCES supplier_bills(id) ON DELETE RESTRICT,
  amount numeric(19,4) NOT NULL CHECK (amount > 0),
  status text NOT NULL CHECK (status IN ('draft', 'posted', 'reversed')),
  journal_entry_id uuid REFERENCES journal_entries(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (supplier_payment_id, supplier_bill_id, status)
);

CREATE INDEX supplier_payment_allocations_bill_idx ON supplier_payment_allocations (supplier_bill_id);

CREATE TABLE supplier_returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_number text NOT NULL UNIQUE,
  supplier_id uuid NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  supplier_bill_id uuid REFERENCES supplier_bills(id) ON DELETE RESTRICT,
  unreferenced boolean NOT NULL DEFAULT false,
  status text NOT NULL CHECK (status IN ('draft', 'submitted', 'approved', 'posted', 'rejected', 'void', 'reversed')),
  return_date date NOT NULL,
  reason text NOT NULL,
  notes text,
  taxable_total numeric(19,4) NOT NULL DEFAULT 0,
  tax_total numeric(19,4) NOT NULL DEFAULT 0,
  total numeric(19,4) NOT NULL DEFAULT 0,
  journal_entry_id uuid REFERENCES journal_entries(id) ON DELETE RESTRICT,
  created_by uuid NOT NULL REFERENCES users(id),
  submitted_at timestamptz,
  submitted_by uuid REFERENCES users(id),
  approved_at timestamptz,
  approved_by uuid REFERENCES users(id),
  posted_at timestamptz,
  posted_by uuid REFERENCES users(id),
  voided_at timestamptz,
  voided_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (unreferenced = (supplier_bill_id IS NULL))
);

CREATE INDEX supplier_returns_supplier_idx ON supplier_returns (supplier_id, return_date DESC);
CREATE INDEX supplier_returns_bill_idx ON supplier_returns (supplier_bill_id);

CREATE TABLE supplier_return_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_return_id uuid NOT NULL REFERENCES supplier_returns(id) ON DELETE CASCADE,
  line_no integer NOT NULL CHECK (line_no > 0),
  supplier_bill_line_id uuid REFERENCES supplier_bill_lines(id) ON DELETE RESTRICT,
  product_id uuid REFERENCES products(id) ON DELETE RESTRICT,
  description text NOT NULL,
  quantity numeric(19,4) NOT NULL CHECK (quantity > 0),
  unit_price numeric(19,4) NOT NULL CHECK (unit_price >= 0),
  discount_amount numeric(19,4) NOT NULL DEFAULT 0,
  discount_treatment text NOT NULL,
  tax_pricing_mode text NOT NULL,
  tax_rate numeric(8,4) NOT NULL DEFAULT 0,
  taxable_base numeric(19,4) NOT NULL DEFAULT 0,
  tax_amount numeric(19,4) NOT NULL DEFAULT 0,
  line_total numeric(19,4) NOT NULL DEFAULT 0,
  purchase_account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  tax_account_id uuid REFERENCES accounts(id) ON DELETE RESTRICT,
  disposition text NOT NULL CHECK (disposition IN ('restockable', 'damaged', 'non_restockable')),
  UNIQUE (supplier_return_id, line_no)
);

COMMENT ON COLUMN supplier_return_lines.disposition IS
  'Recorded for a later stock phase. Phase 3 does not move warehouse quantity or inventory value.';

CREATE INDEX supplier_return_lines_bill_line_idx ON supplier_return_lines (supplier_bill_line_id);

INSERT INTO document_sequences (doc_type, prefix, next_number, pad_length) VALUES
  ('bill', 'BILL-', 1, 5),
  ('supplier_payment', 'SPY-', 1, 5),
  ('supplier_return', 'SRN-', 1, 5)
ON CONFLICT (doc_type) DO NOTHING;

INSERT INTO permissions (code, module, action, description) VALUES
  ('suppliers.view', 'suppliers', 'view', 'View suppliers, balances, and statements'),
  ('suppliers.create', 'suppliers', 'create', 'Create suppliers'),
  ('suppliers.update', 'suppliers', 'update', 'Update suppliers and opening detail'),
  ('bills.view', 'bills', 'view', 'View supplier bills'),
  ('bills.create', 'bills', 'create', 'Create supplier bills'),
  ('bills.update', 'bills', 'update', 'Edit draft supplier bills'),
  ('bills.submit', 'bills', 'submit', 'Submit supplier bills'),
  ('bills.approve', 'bills', 'approve', 'Approve or reject supplier bills'),
  ('bills.post', 'bills', 'post', 'Post supplier bills'),
  ('bills.void', 'bills', 'void', 'Void unposted supplier bills'),
  ('bills.reverse', 'bills', 'reverse', 'Reverse posted supplier bills'),
  ('bills.override_due_date', 'bills', 'override_due_date', 'Set a bill due date that differs from the payment terms'),
  ('supplier_payments.view', 'supplier_payments', 'view', 'View supplier payments'),
  ('supplier_payments.create', 'supplier_payments', 'create', 'Create supplier payments'),
  ('supplier_payments.update', 'supplier_payments', 'update', 'Edit draft supplier payments'),
  ('supplier_payments.submit', 'supplier_payments', 'submit', 'Submit supplier payments'),
  ('supplier_payments.approve', 'supplier_payments', 'approve', 'Approve or reject supplier payments'),
  ('supplier_payments.post', 'supplier_payments', 'post', 'Post supplier payments'),
  ('supplier_payments.allocate', 'supplier_payments', 'allocate', 'Allocate or unallocate a posted supplier payment'),
  ('supplier_payments.void', 'supplier_payments', 'void', 'Void unposted supplier payments'),
  ('supplier_payments.reverse', 'supplier_payments', 'reverse', 'Reverse posted supplier payments'),
  ('supplier_returns.view', 'supplier_returns', 'view', 'View supplier returns'),
  ('supplier_returns.create', 'supplier_returns', 'create', 'Create supplier returns linked to a bill line'),
  ('supplier_returns.create_unreferenced', 'supplier_returns', 'create_unreferenced', 'Create a supplier return that has no source bill'),
  ('supplier_returns.update', 'supplier_returns', 'update', 'Edit draft supplier returns'),
  ('supplier_returns.submit', 'supplier_returns', 'submit', 'Submit supplier returns'),
  ('supplier_returns.approve', 'supplier_returns', 'approve', 'Approve or reject supplier returns'),
  ('supplier_returns.post', 'supplier_returns', 'post', 'Post supplier returns'),
  ('supplier_returns.void', 'supplier_returns', 'void', 'Void unposted supplier returns'),
  ('supplier_returns.reverse', 'supplier_returns', 'reverse', 'Reverse posted supplier returns')
ON CONFLICT (code) DO UPDATE
  SET module = EXCLUDED.module, action = EXCLUDED.action, description = EXCLUDED.description;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM roles r
  JOIN permissions p ON p.module IN ('suppliers', 'bills', 'supplier_payments', 'supplier_returns')
 WHERE r.code = 'company_admin'
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION ap_control_line_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  control_id uuid;
  source text;
BEGIN
  SELECT ap_control_account_id INTO control_id FROM purchasing_settings WHERE id = 1;
  IF control_id IS NULL OR NEW.account_id IS DISTINCT FROM control_id THEN
    RETURN NEW;
  END IF;
  SELECT source_type INTO source FROM journal_entries WHERE id = NEW.journal_entry_id;
  IF source IS NULL OR source NOT IN (
    'opening_balance', 'supplier_bill', 'supplier_payment', 'supplier_payment_allocation', 'supplier_return', 'reversal'
  ) THEN
    RAISE EXCEPTION 'manual journals cannot post to the supplier payable control account';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER ap_control_line_guard_insert BEFORE INSERT ON journal_lines
  FOR EACH ROW EXECUTE PROCEDURE ap_control_line_guard();
CREATE TRIGGER ap_control_line_guard_update BEFORE UPDATE OF account_id ON journal_lines
  FOR EACH ROW EXECUTE PROCEDURE ap_control_line_guard();

CREATE OR REPLACE FUNCTION opening_ap_detail_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  control_id uuid;
  unbalanced boolean;
BEGIN
  IF NEW.status = 'posted' AND OLD.status IS DISTINCT FROM 'posted' AND NEW.source_type = 'opening_balance' THEN
    SELECT ap_control_account_id INTO control_id FROM purchasing_settings WHERE id = 1;
    IF control_id IS NOT NULL THEN
      SELECT EXISTS (
        SELECT 1
          FROM journal_lines jl
         WHERE jl.journal_entry_id = NEW.id
           AND jl.account_id = control_id
           AND (jl.credit - jl.debit) <> COALESCE((
             SELECT SUM(d.amount) FROM supplier_opening_details d WHERE d.journal_line_id = jl.id
           ), 0)
      ) INTO unbalanced;
      IF unbalanced THEN
        RAISE EXCEPTION 'supplier opening detail must equal the accounts payable line';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER opening_ap_detail_guard_update BEFORE UPDATE ON journal_entries
  FOR EACH ROW EXECUTE PROCEDURE opening_ap_detail_guard();
