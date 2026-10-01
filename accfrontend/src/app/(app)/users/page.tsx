"use client";

import { FormEvent, useEffect, useState } from "react";
import { api } from "@/lib/api";

type Role = { id: string; name: string };
type User = { id: string; email: string; displayName: string; isActive: boolean; roles: Role[]; branchIds: string[] };

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [roleIds, setRoleIds] = useState<string[]>([]);
  const [error, setError] = useState("");

  async function load() {
    const [userResult, roleResult] = await Promise.all([
      api<{ data: User[] }>("/api/v1/users?pageSize=100"),
      api<{ data: Role[] }>("/api/v1/roles"),
    ]);
    setUsers(userResult.data);
    setRoles(roleResult.data);
  }
  useEffect(() => { load().catch((caught: Error) => setError(caught.message)); }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      await api("/api/v1/users", { method: "POST", body: JSON.stringify({ email, displayName, password, isActive: true, roleIds, branchIds: [] }) });
      setEmail(""); setDisplayName(""); setPassword(""); setRoleIds([]);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create the user.");
    }
  }

  return (
    <div>
      <h1 className="page-title">Users</h1>
      <p className="lede">Leave branches empty to allow every branch. Assign branches on a later edit when you need to restrict someone. A user cannot grant permissions they do not have.</p>
      {error ? <div className="banner error">{error}</div> : null}
      <form className="card grid" onSubmit={onSubmit}>
        <label className="field"><span>Name</span><input value={displayName} onChange={(event) => setDisplayName(event.target.value)} required /></label>
        <label className="field"><span>Email</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
        <label className="field"><span>Password</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
        <div className="field checks">{roles.map((role) => (
          <label key={role.id}><input type="checkbox" checked={roleIds.includes(role.id)} onChange={(event) => setRoleIds(event.target.checked ? [...roleIds, role.id] : roleIds.filter((id) => id !== role.id))} /> {role.name}</label>
        ))}</div>
        <button className="btn" type="submit">Create user</button>
      </form>
      <div className="card">
        <table>
          <thead><tr><th>Name</th><th>Email</th><th>Roles</th><th>Status</th></tr></thead>
          <tbody>{users.map((user) => <tr key={user.id}><td>{user.displayName}</td><td>{user.email}</td><td>{user.roles.map((role) => role.name).join(", ")}</td><td>{user.isActive ? "Active" : "Inactive"}</td></tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}
