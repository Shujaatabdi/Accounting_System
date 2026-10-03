-- Role codes may include uppercase letters, such as SmgrSale.
-- Uniqueness stays on roles.code. Applied migrations are not edited.

ALTER TABLE roles
  ADD CONSTRAINT roles_code_format_check
  CHECK (char_length(code) BETWEEN 1 AND 40 AND code ~ '^[A-Za-z0-9_]+$');
