"use client";

import { FormEvent, useEffect, useState } from "react";
import { api } from "@/lib/api/client";

type Permission = { code: string; description: string };
type Role = { id: string; code: string; name: string; isSystem: boolean; permissions: string[] };

export default function RolesPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState("");

  async function load() {
    const [roleResult, permissionResult] = await Promise.all([
      api<{ data: Role[] }>("/api/v1/roles"),
      api<{ data: Permission[] }>("/api/v1/permissions"),
    ]);
    setRoles(roleResult.data);
    setPermissions(permissionResult.data);
  }
  useEffect(() => { load().catch((caught: Error) => setError(caught.message)); }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      await api("/api/v1/roles", { method: "POST", body: JSON.stringify({ code, name, permissions: selected }) });
      setName(""); setCode(""); setSelected([]);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create the role.");
    }
  }

  return (
    <div>
      <h1 className="page-title">Roles</h1>
      <p className="lede">The Company Admin role always has every permission. Other roles can be limited by action.</p>
      {error ? <div className="banner error">{error}</div> : null}
      <form className="card" onSubmit={onSubmit}>
        <div className="grid">
          <label className="field"><span>Code</span><input value={code} onChange={(event) => setCode(event.target.value)} required /></label>
          <label className="field"><span>Name</span><input value={name} onChange={(event) => setName(event.target.value)} required /></label>
        </div>
        <div className="checks" style={{ margin: "12px 0" }}>
          {permissions.map((permission) => (
            <label key={permission.code}><input type="checkbox" checked={selected.includes(permission.code)} onChange={(event) => setSelected(event.target.checked ? [...selected, permission.code] : selected.filter((code) => code !== permission.code))} /> {permission.code}</label>
          ))}
        </div>
        <button className="btn" type="submit">Create role</button>
      </form>
      {roles.map((role) => (
        <div className="card" key={role.id}>
          <strong>{role.name}</strong> <span className="badge">{role.code}</span>
          <p>{role.isSystem ? "System role. Permissions stay complete." : role.permissions.join(", ") || "No permissions"}</p>
        </div>
      ))}
    </div>
  );
}
