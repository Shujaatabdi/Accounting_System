-- Manual ATL records for customers and suppliers. Does not connect to FBR or IRIS.
-- A posted invoice or bill keeps a copy. That copy does not change tax or journals.

ALTER TABLE customers
  ADD COLUMN atl_status text,
  ADD COLUMN atl_checked_at timestamptz,
  ADD COLUMN atl_reference text,
  ADD COLUMN atl_recorded_by uuid REFERENCES users(id),
  ADD COLUMN atl_recorded_at timestamptz,
  ADD CONSTRAINT customers_atl_record_check CHECK (
    (atl_status IS NULL AND atl_checked_at IS NULL AND atl_reference IS NULL AND atl_recorded_by IS NULL AND atl_recorded_at IS NULL)
    OR (atl_status IN ('active', 'inactive') AND atl_checked_at IS NOT NULL AND atl_reference IS NOT NULL AND atl_recorded_by IS NOT NULL AND atl_recorded_at IS NOT NULL)
  );

ALTER TABLE suppliers
  ADD COLUMN atl_status text,
  ADD COLUMN atl_checked_at timestamptz,
  ADD COLUMN atl_reference text,
  ADD COLUMN atl_recorded_by uuid REFERENCES users(id),
  ADD COLUMN atl_recorded_at timestamptz,
  ADD CONSTRAINT suppliers_atl_record_check CHECK (
    (atl_status IS NULL AND atl_checked_at IS NULL AND atl_reference IS NULL AND atl_recorded_by IS NULL AND atl_recorded_at IS NULL)
    OR (atl_status IN ('active', 'inactive') AND atl_checked_at IS NOT NULL AND atl_reference IS NOT NULL AND atl_recorded_by IS NOT NULL AND atl_recorded_at IS NOT NULL)
  );

COMMENT ON COLUMN customers.atl_status IS
  'Manual ATL result. Not verified. Not a tax rate.';
COMMENT ON COLUMN suppliers.atl_status IS
  'Manual ATL result. Not verified. Not a tax rate.';

ALTER TABLE invoices
  ADD COLUMN snapshot_atl_captured boolean NOT NULL DEFAULT false,
  ADD COLUMN snapshot_atl_status text,
  ADD COLUMN snapshot_atl_checked_at timestamptz,
  ADD COLUMN snapshot_atl_reference text,
  ADD CONSTRAINT invoices_atl_snapshot_check CHECK (
    snapshot_atl_status IS NULL OR snapshot_atl_status IN ('active', 'inactive')
  );

ALTER TABLE supplier_bills
  ADD COLUMN snapshot_atl_captured boolean NOT NULL DEFAULT false,
  ADD COLUMN snapshot_atl_status text,
  ADD COLUMN snapshot_atl_checked_at timestamptz,
  ADD COLUMN snapshot_atl_reference text,
  ADD CONSTRAINT supplier_bills_atl_snapshot_check CHECK (
    snapshot_atl_status IS NULL OR snapshot_atl_status IN ('active', 'inactive')
  );

CREATE OR REPLACE FUNCTION posted_atl_snapshot_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = 'posted' AND (
    NEW.snapshot_atl_captured IS DISTINCT FROM OLD.snapshot_atl_captured
    OR NEW.snapshot_atl_status IS DISTINCT FROM OLD.snapshot_atl_status
    OR NEW.snapshot_atl_checked_at IS DISTINCT FROM OLD.snapshot_atl_checked_at
    OR NEW.snapshot_atl_reference IS DISTINCT FROM OLD.snapshot_atl_reference
  ) THEN
    RAISE EXCEPTION 'A posted ATL snapshot cannot be changed';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER invoices_atl_snapshot_guard
  BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE PROCEDURE posted_atl_snapshot_guard();

CREATE TRIGGER supplier_bills_atl_snapshot_guard
  BEFORE UPDATE ON supplier_bills
  FOR EACH ROW EXECUTE PROCEDURE posted_atl_snapshot_guard();

INSERT INTO permissions (code, module, action, description)
VALUES
  ('customers.record_atl', 'customers', 'record_atl', 'Record a manual ATL status for a customer'),
  ('suppliers.record_atl', 'suppliers', 'record_atl', 'Record a manual ATL status for a supplier')
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM roles r
  JOIN permissions p ON p.code IN ('customers.record_atl', 'suppliers.record_atl')
 WHERE r.code = 'company_admin'
ON CONFLICT DO NOTHING;
