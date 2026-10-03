"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { ApiError, api } from "@/lib/api/client";
import {
  ROLE_CODE_MESSAGE,
  ROLE_CODE_PATTERN,
  groupCheckState,
  groupPermissions,
  selectAllPermissions,
  toggleGroup,
  validationLines,
  type PermissionItem,
} from "../permission-groups";

type Role = { id: string; code: string; name: string; isSystem: boolean; permissions: string[] };

export default function RolesPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<PermissionItem[]>([]);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);

  async function load() {
    const [roleResult, permissionResult] = await Promise.all([
      api<{ data: Role[] }>("/api/v1/roles"),
      api<{ data: PermissionItem[] }>("/api/v1/permissions"),
    ]);
    setRoles(roleResult.data);
    setPermissions(permissionResult.data);
  }
  useEffect(() => { load().catch((caught: unknown) => setErrors(linesFrom(caught))); }, []);

  function reset() {
    setEditingId(null);
    setName("");
    setCode("");
    setSelected([]);
  }

  function loadRole(role: Role) {
    setErrors([]);
    setEditingId(role.id);
    setCode(role.code);
    setName(role.name);
    setSelected([...role.permissions]);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setErrors([]);
    if (!editingId && !ROLE_CODE_PATTERN.test(code.trim())) {
      setErrors([`Code: ${ROLE_CODE_MESSAGE}`]);
      return;
    }
    try {
      if (editingId) {
        await api(`/api/v1/roles/${editingId}`, { method: "PUT", body: JSON.stringify({ name, permissions: selected }) });
      } else {
        await api("/api/v1/roles", { method: "POST", body: JSON.stringify({ code, name, permissions: selected }) });
      }
      reset();
      await load();
    } catch (caught) {
      setErrors(linesFrom(caught));
    }
  }

  const groups = groupPermissions(permissions);
  const catalogCodes = selectAllPermissions(permissions);
  return (
    <div>
      <h1 className="page-title">Roles</h1>
      <p className="lede">The Company Admin role always has every permission. Other roles can be limited by action. A role code can use letters, digits, and underscores.</p>
      {errors.length > 0 ? (
        <div className="banner error" role="alert">
          {errors.map((line) => <p key={line}>{line}</p>)}
        </div>
      ) : null}
      <form className="card" onSubmit={onSubmit}>
        <div className="grid">
          <label className="field"><span>Code</span><input value={code} onChange={(event) => setCode(event.target.value)} required disabled={Boolean(editingId)} aria-describedby="role-code-help" /></label>
          <label className="field"><span>Name</span><input value={name} onChange={(event) => setName(event.target.value)} required /></label>
        </div>
        <p id="role-code-help">Example: SmgrSale. Letters, digits, and underscores, up to 40 characters.</p>
        <div className="row">
          <button className="btn quiet" type="button" onClick={() => setSelected(catalogCodes)}>Select all permissions</button>
          <button className="btn quiet" type="button" onClick={() => setSelected([])}>Clear all</button>
        </div>
        <div className="permission-groups">
          {groups.map((group) => {
            const codes = group.permissions.map((permission) => permission.code);
            const state = groupCheckState(selected, codes);
            return (
              <fieldset className="permission-group" key={group.id}>
                <legend>
                  <GroupCheckbox
                    label={`Select all ${group.label} permissions`}
                    checked={state === "all"}
                    indeterminate={state === "some"}
                    onChange={() => setSelected(toggleGroup(selected, codes))}
                  />
                  {" "}{group.label}
                </legend>
                <div className="checks">
                  {group.permissions.map((permission) => (
                    <label key={permission.code}>
                      <input
                        type="checkbox"
                        checked={selected.includes(permission.code)}
                        aria-label={`${permission.description} (${permission.code})`}
                        onChange={(event) => setSelected(event.target.checked
                          ? [...selected, permission.code]
                          : selected.filter((item) => item !== permission.code))}
                      />
                      <span>{permission.description}</span>
                      <span className="permission-code">{permission.code}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            );
          })}
        </div>
        <div className="row">
          <button className="btn" type="submit">{editingId ? "Save role" : "Create role"}</button>
          {editingId ? <button className="btn quiet" type="button" onClick={reset}>Cancel</button> : null}
        </div>
      </form>
      {roles.map((role) => (
        <div className="card" key={role.id}>
          <strong>{role.name}</strong> <span className="badge">{role.code}</span>
          {role.isSystem ? <p>System role. Permissions stay complete.</p> : (
            <>
              <p>{role.permissions.join(", ") || "No permissions"}</p>
              <button className="btn quiet" type="button" onClick={() => loadRole(role)}>Edit {role.name}</button>
            </>
          )}
        </div>
      ))}
    </div>
  );
}

function GroupCheckbox({ label, checked, indeterminate, onChange }: { label: string; checked: boolean; indeterminate: boolean; onChange: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      aria-label={label}
      aria-checked={indeterminate ? "mixed" : checked}
      onChange={onChange}
    />
  );
}

function linesFrom(caught: unknown) {
  if (caught instanceof ApiError) return validationLines(caught.message, caught.details);
  return [caught instanceof Error ? caught.message : "Could not save the role."];
}
