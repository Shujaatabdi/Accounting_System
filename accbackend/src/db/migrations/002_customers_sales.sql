-- Phase 2 customers and sales. Does not rewrite the foundation migration.

ALTER TABLE journal_entries DROP CONSTRAINT journal_entries_source_type_check;
ALTER TABLE journal_entries ADD CONSTRAINT journal_entries_source_type_check
  CHECK (source_type IN (
    'manual', 'opening_balance', 'reversal',
    'invoice', 'receipt', 'receipt_allocation', 'customer_return'
  ));

CREATE TABLE sales_settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  tax_pricing_mode text NOT NULL DEFAULT 'exclusive' CHECK (tax_pricing_mode IN ('exclusive', 'inclusive')),
  discount_treatment text NOT NULL DEFAULT 'reduce_taxable_base' CHECK (discount_treatment IN ('reduce_taxable_base')),
  unapplied_receipt_treatment text NOT NULL DEFAULT 'customer_advance' CHECK (unapplied_receipt_treatment IN ('customer_advance', 'credit_ar')),
  ar_control_account_id uuid REFERENCES accounts(id) ON DELETE RESTRICT,
  customer_advance_account_id uuid REFERENCES accounts(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO sales_settings (id, ar_control_account_id)
SELECT 1, id FROM accounts WHERE code = '1200'
UNION ALL
SELECT 1, NULL::uuid
WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE code = '1200')
  AND NOT EXISTS (SELECT 1 FROM sales_settings);

CREATE TABLE customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  legal_name text NOT NULL,
  display_name text NOT NULL,
  contact_name text,
  phone text,
  email text,
  tax_identifier text,
  payment_terms_days integer NOT NULL DEFAULT 0 CHECK (payment_terms_days >= 0),
  credit_limit numeric(19,4) CHECK (credit_limit IS NULL OR credit_limit >= 0),
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customers_code_unique UNIQUE (code)
);

CREATE UNIQUE INDEX customers_code_lower_idx ON customers (lower(code));

CREATE TABLE customer_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  address_type text NOT NULL CHECK (address_type IN ('billing', 'shipping', 'other')),
  line1 text NOT NULL,
  line2 text,
  city text,
  region text,
  postal_code text,
  country_code char(2) NOT NULL,
  is_primary boolean NOT NULL DEFAULT false
);

CREATE UNIQUE INDEX customer_addresses_one_primary
  ON customer_addresses (customer_id) WHERE is_primary;

CREATE TABLE customer_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  name text NOT NULL,
  role_title text,
  phone text,
  email text,
  is_primary boolean NOT NULL DEFAULT false
);

CREATE UNIQUE INDEX customer_contacts_one_primary
  ON customer_contacts (customer_id) WHERE is_primary;

CREATE TABLE customer_opening_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_line_id uuid NOT NULL REFERENCES journal_lines(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  amount numeric(19,4) NOT NULL CHECK (amount <> 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX customer_opening_details_line_idx ON customer_opening_details (journal_line_id);
CREATE INDEX customer_opening_details_customer_idx ON customer_opening_details (customer_id);

CREATE TABLE product_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_categories_code_unique UNIQUE (code)
);

CREATE TABLE units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT units_code_unique UNIQUE (code)
);

CREATE TABLE products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku text NOT NULL,
  name text NOT NULL,
  description text,
  item_type text NOT NULL CHECK (item_type IN ('stock', 'non_stock', 'service')),
  category_id uuid REFERENCES product_categories(id) ON DELETE RESTRICT,
  sales_price numeric(19,4) NOT NULL DEFAULT 0 CHECK (sales_price >= 0),
  tax_code_id uuid REFERENCES tax_codes(id) ON DELETE RESTRICT,
  base_unit_id uuid REFERENCES units(id) ON DELETE RESTRICT,
  sales_account_id uuid REFERENCES accounts(id) ON DELETE RESTRICT,
  return_account_id uuid REFERENCES accounts(id) ON DELETE RESTRICT,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT products_sku_unique UNIQUE (sku)
);

CREATE UNIQUE INDEX products_sku_lower_idx ON products (lower(sku));
CREATE INDEX products_category_idx ON products (category_id);

CREATE TABLE product_units (
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  unit_id uuid NOT NULL REFERENCES units(id) ON DELETE RESTRICT,
  factor numeric(19,6) NOT NULL CHECK (factor > 0),
  is_base boolean NOT NULL DEFAULT false,
  PRIMARY KEY (product_id, unit_id)
);

CREATE UNIQUE INDEX product_units_one_base ON product_units (product_id) WHERE is_base;

CREATE TABLE invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number text NOT NULL UNIQUE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  status text NOT NULL CHECK (status IN ('draft', 'submitted', 'approved', 'posted', 'rejected', 'void', 'reversed')),
  invoice_date date NOT NULL,
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

CREATE INDEX invoices_customer_idx ON invoices (customer_id, invoice_date DESC);
CREATE INDEX invoices_status_idx ON invoices (status, invoice_date DESC);

CREATE TABLE invoice_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
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
  sales_account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  tax_account_id uuid REFERENCES accounts(id) ON DELETE RESTRICT,
  UNIQUE (invoice_id, line_no)
);

CREATE INDEX invoice_lines_invoice_idx ON invoice_lines (invoice_id);

CREATE TABLE receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_number text NOT NULL UNIQUE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  status text NOT NULL CHECK (status IN ('draft', 'submitted', 'approved', 'posted', 'rejected', 'void', 'reversed')),
  receipt_date date NOT NULL,
  cash_account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  amount numeric(19,4) NOT NULL CHECK (amount > 0),
  unallocated_amount numeric(19,4) NOT NULL DEFAULT 0 CHECK (unallocated_amount >= 0),
  unapplied_treatment text NOT NULL CHECK (unapplied_treatment IN ('customer_advance', 'credit_ar')),
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

CREATE INDEX receipts_customer_idx ON receipts (customer_id, receipt_date DESC);

CREATE TABLE receipt_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id uuid NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
  amount numeric(19,4) NOT NULL CHECK (amount > 0),
  status text NOT NULL CHECK (status IN ('draft', 'posted', 'reversed')),
  journal_entry_id uuid REFERENCES journal_entries(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (receipt_id, invoice_id, status)
);

CREATE INDEX receipt_allocations_invoice_idx ON receipt_allocations (invoice_id);

CREATE TABLE customer_returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_number text NOT NULL UNIQUE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  invoice_id uuid REFERENCES invoices(id) ON DELETE RESTRICT,
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
  CHECK (unreferenced = (invoice_id IS NULL))
);

CREATE INDEX customer_returns_customer_idx ON customer_returns (customer_id, return_date DESC);
CREATE INDEX customer_returns_invoice_idx ON customer_returns (invoice_id);

CREATE TABLE customer_return_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_return_id uuid NOT NULL REFERENCES customer_returns(id) ON DELETE CASCADE,
  line_no integer NOT NULL CHECK (line_no > 0),
  invoice_line_id uuid REFERENCES invoice_lines(id) ON DELETE RESTRICT,
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
  return_account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  tax_account_id uuid REFERENCES accounts(id) ON DELETE RESTRICT,
  disposition text NOT NULL CHECK (disposition IN ('restockable', 'damaged', 'non_restockable')),
  UNIQUE (customer_return_id, line_no)
);

CREATE INDEX customer_return_lines_invoice_line_idx ON customer_return_lines (invoice_line_id);

INSERT INTO document_sequences (doc_type, prefix, next_number, pad_length) VALUES
  ('invoice', 'INV-', 1, 5),
  ('receipt', 'RCT-', 1, 5),
  ('customer_return', 'CRN-', 1, 5)
ON CONFLICT (doc_type) DO NOTHING;

INSERT INTO permissions (code, module, action, description) VALUES
  ('customers.view', 'customers', 'view', 'View customers, balances, and statements'),
  ('customers.create', 'customers', 'create', 'Create customers'),
  ('customers.update', 'customers', 'update', 'Update customers and opening detail'),
  ('products.view', 'products', 'view', 'View products and services'),
  ('products.create', 'products', 'create', 'Create products, categories, and units'),
  ('products.update', 'products', 'update', 'Update products, categories, and units'),
  ('invoices.view', 'invoices', 'view', 'View sales invoices'),
  ('invoices.create', 'invoices', 'create', 'Create sales invoices'),
  ('invoices.update', 'invoices', 'update', 'Edit draft sales invoices'),
  ('invoices.submit', 'invoices', 'submit', 'Submit sales invoices'),
  ('invoices.approve', 'invoices', 'approve', 'Approve or reject sales invoices'),
  ('invoices.post', 'invoices', 'post', 'Post sales invoices'),
  ('invoices.void', 'invoices', 'void', 'Void unposted sales invoices'),
  ('invoices.reverse', 'invoices', 'reverse', 'Reverse posted sales invoices'),
  ('invoices.override_due_date', 'invoices', 'override_due_date', 'Set an invoice due date that differs from the payment terms'),
  ('invoices.override_credit_limit', 'invoices', 'override_credit_limit', 'Post an invoice that exceeds the customer credit limit'),
  ('receipts.view', 'receipts', 'view', 'View customer receipts'),
  ('receipts.create', 'receipts', 'create', 'Create customer receipts'),
  ('receipts.update', 'receipts', 'update', 'Edit draft customer receipts'),
  ('receipts.submit', 'receipts', 'submit', 'Submit customer receipts'),
  ('receipts.approve', 'receipts', 'approve', 'Approve or reject customer receipts'),
  ('receipts.post', 'receipts', 'post', 'Post customer receipts'),
  ('receipts.allocate', 'receipts', 'allocate', 'Allocate or unallocate a posted receipt'),
  ('receipts.void', 'receipts', 'void', 'Void unposted customer receipts'),
  ('receipts.reverse', 'receipts', 'reverse', 'Reverse posted customer receipts'),
  ('customer_returns.view', 'customer_returns', 'view', 'View customer returns'),
  ('customer_returns.create', 'customer_returns', 'create', 'Create customer returns linked to an invoice line'),
  ('customer_returns.create_unreferenced', 'customer_returns', 'create_unreferenced', 'Create a customer return that has no source invoice'),
  ('customer_returns.update', 'customer_returns', 'update', 'Edit draft customer returns'),
  ('customer_returns.submit', 'customer_returns', 'submit', 'Submit customer returns'),
  ('customer_returns.approve', 'customer_returns', 'approve', 'Approve or reject customer returns'),
  ('customer_returns.post', 'customer_returns', 'post', 'Post customer returns'),
  ('customer_returns.void', 'customer_returns', 'void', 'Void unposted customer returns'),
  ('customer_returns.reverse', 'customer_returns', 'reverse', 'Reverse posted customer returns')
ON CONFLICT (code) DO UPDATE
  SET module = EXCLUDED.module, action = EXCLUDED.action, description = EXCLUDED.description;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM roles r
  JOIN permissions p ON p.module IN ('customers', 'products', 'invoices', 'receipts', 'customer_returns')
 WHERE r.code = 'company_admin'
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION ar_control_line_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  control_id uuid;
  source text;
BEGIN
  SELECT ar_control_account_id INTO control_id FROM sales_settings WHERE id = 1;
  IF control_id IS NULL OR NEW.account_id IS DISTINCT FROM control_id THEN
    RETURN NEW;
  END IF;
  SELECT source_type INTO source FROM journal_entries WHERE id = NEW.journal_entry_id;
  IF source IS NULL OR source NOT IN (
    'opening_balance', 'invoice', 'receipt', 'receipt_allocation', 'customer_return', 'reversal'
  ) THEN
    RAISE EXCEPTION 'manual journals cannot post to the customer receivable control account';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER ar_control_line_guard_insert BEFORE INSERT ON journal_lines
  FOR EACH ROW EXECUTE PROCEDURE ar_control_line_guard();
CREATE TRIGGER ar_control_line_guard_update BEFORE UPDATE OF account_id ON journal_lines
  FOR EACH ROW EXECUTE PROCEDURE ar_control_line_guard();

CREATE OR REPLACE FUNCTION opening_ar_detail_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  control_id uuid;
  unbalanced boolean;
BEGIN
  IF NEW.status = 'posted' AND OLD.status IS DISTINCT FROM 'posted' AND NEW.source_type = 'opening_balance' THEN
    SELECT ar_control_account_id INTO control_id FROM sales_settings WHERE id = 1;
    IF control_id IS NOT NULL THEN
      SELECT EXISTS (
        SELECT 1
          FROM journal_lines jl
         WHERE jl.journal_entry_id = NEW.id
           AND jl.account_id = control_id
           AND (jl.debit - jl.credit) <> COALESCE((
             SELECT SUM(d.amount) FROM customer_opening_details d WHERE d.journal_line_id = jl.id
           ), 0)
      ) INTO unbalanced;
      IF unbalanced THEN
        RAISE EXCEPTION 'customer opening detail must equal the accounts receivable line';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER opening_ar_detail_guard_update BEFORE UPDATE ON journal_entries
  FOR EACH ROW EXECUTE PROCEDURE opening_ar_detail_guard();
