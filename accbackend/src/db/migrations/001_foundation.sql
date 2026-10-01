-- Phase 1 foundation schema. One company per database. PostgreSQL 14+.

CREATE TABLE company (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  legal_name text NOT NULL,
  display_name text NOT NULL,
  country_code char(2) NOT NULL,
  tax_identifier text,
  timezone text NOT NULL DEFAULT 'UTC',
  currency_name text NOT NULL,
  currency_symbol text NOT NULL,
  currency_decimal_places smallint NOT NULL DEFAULT 2 CHECK (currency_decimal_places BETWEEN 0 AND 4),
  fiscal_year_start_month smallint NOT NULL DEFAULT 1 CHECK (fiscal_year_start_month BETWEEN 1 AND 12),
  require_distinct_approver boolean NOT NULL DEFAULT false,
  logo_url text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE company_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  address_type text NOT NULL CHECK (address_type IN ('registered', 'billing', 'other')),
  line1 text NOT NULL,
  line2 text,
  city text,
  region text,
  postal_code text,
  country_code char(2) NOT NULL,
  is_primary boolean NOT NULL DEFAULT false
);

CREATE UNIQUE INDEX company_addresses_one_primary
  ON company_addresses (is_primary) WHERE is_primary;

CREATE TABLE company_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  role_title text,
  phone text,
  email text,
  is_primary boolean NOT NULL DEFAULT false
);

CREATE UNIQUE INDEX company_contacts_one_primary
  ON company_contacts (is_primary) WHERE is_primary;

CREATE TABLE document_sequences (
  doc_type text PRIMARY KEY,
  prefix text NOT NULL DEFAULT '',
  next_number integer NOT NULL DEFAULT 1 CHECK (next_number > 0),
  pad_length smallint NOT NULL DEFAULT 5 CHECK (pad_length BETWEEN 1 AND 12),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  line1 text,
  city text,
  region text,
  country_code char(2),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT branches_code_unique UNIQUE (code)
);

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  password_hash text NOT NULL,
  display_name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  must_change_password boolean NOT NULL DEFAULT false,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX users_email_lower_idx ON users (lower(email));

CREATE TABLE roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  module text NOT NULL,
  action text NOT NULL,
  description text NOT NULL
);

CREATE TABLE role_permissions (
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE user_roles (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, role_id)
);

CREATE TABLE user_branches (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, branch_id)
);

CREATE TABLE audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  actor_user_id uuid REFERENCES users(id),
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  summary text,
  before_data jsonb,
  after_data jsonb,
  ip_address text,
  request_id text
);

CREATE INDEX audit_log_occurred_at_idx ON audit_log (occurred_at DESC);
CREATE INDEX audit_log_entity_idx ON audit_log (entity_type, entity_id);
CREATE INDEX audit_log_actor_idx ON audit_log (actor_user_id, occurred_at DESC);

CREATE TABLE fiscal_years (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  status text NOT NULL CHECK (status IN ('open', 'closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date),
  CONSTRAINT fiscal_years_no_overlap EXCLUDE USING gist (daterange(start_date, end_date, '[]') WITH &&)
);

CREATE TABLE fiscal_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fiscal_year_id uuid NOT NULL REFERENCES fiscal_years(id) ON DELETE CASCADE,
  period_no smallint NOT NULL CHECK (period_no BETWEEN 1 AND 12),
  name text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  status text NOT NULL CHECK (status IN ('open', 'closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (fiscal_year_id, period_no),
  CHECK (end_date >= start_date),
  CONSTRAINT fiscal_periods_no_overlap EXCLUDE USING gist (daterange(start_date, end_date, '[]') WITH &&)
);

CREATE INDEX fiscal_periods_dates_idx ON fiscal_periods (start_date, end_date);

CREATE TABLE accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  name text NOT NULL,
  account_type text NOT NULL CHECK (account_type IN ('asset', 'liability', 'equity', 'income', 'expense')),
  account_subtype text,
  parent_id uuid REFERENCES accounts(id) ON DELETE RESTRICT,
  is_header boolean NOT NULL DEFAULT false,
  is_control boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  is_system boolean NOT NULL DEFAULT false,
  normal_balance text NOT NULL CHECK (normal_balance IN ('debit', 'credit')),
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT accounts_code_unique UNIQUE (code),
  CONSTRAINT accounts_normal_balance_matches_type CHECK (
    (account_type IN ('asset', 'expense') AND normal_balance = 'debit')
    OR (account_type IN ('liability', 'equity', 'income') AND normal_balance = 'credit')
  ),
  CONSTRAINT accounts_not_own_parent CHECK (parent_id IS DISTINCT FROM id)
);

CREATE INDEX accounts_parent_idx ON accounts (parent_id);
CREATE INDEX accounts_type_idx ON accounts (account_type);

CREATE TABLE accounting_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code char(2) NOT NULL,
  name text NOT NULL,
  compliance_status text NOT NULL DEFAULT 'unverified' CHECK (compliance_status IN ('unverified', 'reviewed')),
  notes text,
  effective_from date NOT NULL,
  effective_to date,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

CREATE INDEX accounting_profiles_effective_idx ON accounting_profiles (effective_from DESC);

CREATE TABLE tax_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  name text NOT NULL,
  rate_percent numeric(8,4) NOT NULL CHECK (rate_percent >= 0 AND rate_percent <= 100),
  sales_account_id uuid REFERENCES accounts(id) ON DELETE RESTRICT,
  purchase_account_id uuid REFERENCES accounts(id) ON DELETE RESTRICT,
  effective_from date NOT NULL,
  effective_to date,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (code, effective_from),
  CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

CREATE INDEX tax_codes_code_idx ON tax_codes (code, effective_from);

CREATE TABLE journal_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_number text NOT NULL UNIQUE,
  entry_date date NOT NULL,
  posting_date date,
  fiscal_period_id uuid REFERENCES fiscal_periods(id) ON DELETE RESTRICT,
  status text NOT NULL CHECK (status IN ('draft', 'pending_approval', 'approved', 'posted', 'void')),
  description text NOT NULL,
  reference text,
  source_type text NOT NULL DEFAULT 'manual' CHECK (source_type IN ('manual', 'opening_balance', 'reversal')),
  source_id uuid,
  reverses_entry_id uuid REFERENCES journal_entries(id) ON DELETE RESTRICT,
  reversed_by_entry_id uuid REFERENCES journal_entries(id) ON DELETE RESTRICT,
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

CREATE INDEX journal_entries_status_date_idx ON journal_entries (status, entry_date DESC);
CREATE INDEX journal_entries_posted_date_idx ON journal_entries (posting_date, id) WHERE status = 'posted';
CREATE INDEX journal_entries_reversal_idx ON journal_entries (reverses_entry_id);

CREATE TABLE journal_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_entry_id uuid NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  line_no integer NOT NULL CHECK (line_no > 0),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  branch_id uuid REFERENCES branches(id) ON DELETE RESTRICT,
  description text,
  debit numeric(19,4) NOT NULL DEFAULT 0 CHECK (debit >= 0),
  credit numeric(19,4) NOT NULL DEFAULT 0 CHECK (credit >= 0),
  account_code_snapshot text,
  account_name_snapshot text,
  CHECK (NOT (debit > 0 AND credit > 0)),
  CHECK (debit > 0 OR credit > 0),
  UNIQUE (journal_entry_id, line_no)
);

CREATE INDEX journal_lines_account_idx ON journal_lines (account_id);
CREATE INDEX journal_lines_entry_idx ON journal_lines (journal_entry_id);
CREATE INDEX journal_lines_branch_idx ON journal_lines (branch_id);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER company_set_updated_at BEFORE UPDATE ON company
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
CREATE TRIGGER branches_set_updated_at BEFORE UPDATE ON branches
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
CREATE TRIGGER users_set_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
CREATE TRIGGER roles_set_updated_at BEFORE UPDATE ON roles
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
CREATE TRIGGER fiscal_years_set_updated_at BEFORE UPDATE ON fiscal_years
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
CREATE TRIGGER fiscal_periods_set_updated_at BEFORE UPDATE ON fiscal_periods
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
CREATE TRIGGER accounts_set_updated_at BEFORE UPDATE ON accounts
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
CREATE TRIGGER document_sequences_set_updated_at BEFORE UPDATE ON document_sequences
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
CREATE TRIGGER journal_entries_set_updated_at BEFORE UPDATE ON journal_entries
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

CREATE OR REPLACE FUNCTION journal_lines_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  parent_status text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT status INTO parent_status FROM journal_entries WHERE id = OLD.journal_entry_id;
    IF parent_status IS DISTINCT FROM 'draft' THEN
      RAISE EXCEPTION 'journal lines can only be removed while the entry is a draft';
    END IF;
    RETURN OLD;
  END IF;

  SELECT status INTO parent_status FROM journal_entries WHERE id = NEW.journal_entry_id;
  IF parent_status = 'posted' THEN
    RAISE EXCEPTION 'posted journal lines are immutable';
  END IF;

  IF parent_status IS DISTINCT FROM 'draft' THEN
    IF TG_OP = 'INSERT' THEN
      RAISE EXCEPTION 'journal lines can only be added while the entry is a draft';
    END IF;
    IF NEW.account_id IS DISTINCT FROM OLD.account_id
       OR NEW.debit IS DISTINCT FROM OLD.debit
       OR NEW.credit IS DISTINCT FROM OLD.credit
       OR NEW.branch_id IS DISTINCT FROM OLD.branch_id
       OR NEW.line_no IS DISTINCT FROM OLD.line_no
       OR NEW.description IS DISTINCT FROM OLD.description
       OR NEW.journal_entry_id IS DISTINCT FROM OLD.journal_entry_id
    THEN
      RAISE EXCEPTION 'journal lines are frozen after draft';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER journal_lines_guard_insert BEFORE INSERT ON journal_lines
  FOR EACH ROW EXECUTE PROCEDURE journal_lines_guard();
CREATE TRIGGER journal_lines_guard_update BEFORE UPDATE ON journal_lines
  FOR EACH ROW EXECUTE PROCEDURE journal_lines_guard();
CREATE TRIGGER journal_lines_guard_delete BEFORE DELETE ON journal_lines
  FOR EACH ROW EXECUTE PROCEDURE journal_lines_guard();

CREATE OR REPLACE FUNCTION journal_entries_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  debit_total numeric(19,4);
  credit_total numeric(19,4);
  line_count integer;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'posted' OR OLD.reverses_entry_id IS NOT NULL THEN
      RAISE EXCEPTION 'posted journals cannot be deleted';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.status = 'void' THEN
    RAISE EXCEPTION 'voided journals cannot be modified';
  END IF;

  IF OLD.status IN ('pending_approval', 'approved', 'posted') THEN
    IF NEW.entry_number IS DISTINCT FROM OLD.entry_number
       OR NEW.entry_date IS DISTINCT FROM OLD.entry_date
       OR NEW.description IS DISTINCT FROM OLD.description
       OR NEW.reference IS DISTINCT FROM OLD.reference
       OR NEW.source_type IS DISTINCT FROM OLD.source_type
       OR NEW.source_id IS DISTINCT FROM OLD.source_id
       OR NEW.created_by IS DISTINCT FROM OLD.created_by
       OR NEW.reverses_entry_id IS DISTINCT FROM OLD.reverses_entry_id
    THEN
      RAISE EXCEPTION 'journal header is frozen after draft';
    END IF;
  END IF;

  IF OLD.status = 'posted' THEN
    IF NEW.status IS DISTINCT FROM OLD.status
       OR NEW.posting_date IS DISTINCT FROM OLD.posting_date
       OR NEW.fiscal_period_id IS DISTINCT FROM OLD.fiscal_period_id
       OR NEW.posted_at IS DISTINCT FROM OLD.posted_at
       OR NEW.posted_by IS DISTINCT FROM OLD.posted_by
       OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
       OR NEW.approved_by IS DISTINCT FROM OLD.approved_by
       OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at
       OR NEW.submitted_by IS DISTINCT FROM OLD.submitted_by
    THEN
      RAISE EXCEPTION 'posted journals cannot be modified';
    END IF;
    IF OLD.reversed_by_entry_id IS NOT NULL
       AND NEW.reversed_by_entry_id IS DISTINCT FROM OLD.reversed_by_entry_id THEN
      RAISE EXCEPTION 'reversal link cannot be changed';
    END IF;
  END IF;

  IF NEW.status = 'posted' AND OLD.status IS DISTINCT FROM 'posted' THEN
    IF OLD.status <> 'approved'
       AND current_setting('acc.allow_system_post', true) IS DISTINCT FROM 'on' THEN
      RAISE EXCEPTION 'only approved journals can be posted';
    END IF;
    SELECT COALESCE(SUM(debit), 0), COALESCE(SUM(credit), 0), COUNT(*)
      INTO debit_total, credit_total, line_count
      FROM journal_lines
     WHERE journal_entry_id = NEW.id;
    IF line_count < 2 OR debit_total <> credit_total OR debit_total = 0 THEN
      RAISE EXCEPTION 'journal entry is not balanced';
    END IF;
    IF NEW.posting_date IS NULL OR NEW.fiscal_period_id IS NULL OR NEW.posted_by IS NULL OR NEW.posted_at IS NULL THEN
      RAISE EXCEPTION 'posted journals require a posting date, period, and poster';
    END IF;
    IF EXISTS (
      SELECT 1 FROM journal_lines
       WHERE journal_entry_id = NEW.id
         AND (account_code_snapshot IS NULL OR account_name_snapshot IS NULL)
    ) THEN
      RAISE EXCEPTION 'posted journals must snapshot account names';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER journal_entries_guard_update BEFORE UPDATE ON journal_entries
  FOR EACH ROW EXECUTE PROCEDURE journal_entries_guard();
CREATE TRIGGER journal_entries_guard_delete BEFORE DELETE ON journal_entries
  FOR EACH ROW EXECUTE PROCEDURE journal_entries_guard();
