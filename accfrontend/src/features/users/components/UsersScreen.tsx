"use client";

import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/lib/api/client";
import { errorLines } from "@/lib/api/errors";
import { can } from "@/lib/auth/session";

type Role = { id: string; name: string };
type Branch = { id: string; code: string; name: string };
type User = { id: string; email: string; displayName: string; isActive: boolean; roles: Role[]; branchIds: string[] };

export default function UsersPage() {
  const auth = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [roleIds, setRoleIds] = useState<string[]>([]);
  const [branchIds, setBranchIds] = useState<string[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);

  const canUpdate = can(auth.user, "users.update");
  const canCreate = can(auth.user, "users.create");
  const canAssignBranches = can(auth.user, "branches.view");

  async function load() {
    const userResult = await api<{ data: User[] }>("/api/v1/users?pageSize=100");
    setUsers(userResult.data);
    const notes: string[] = [];
    if (can(auth.user, "roles.view")) {
      try {
        setRoles((await api<{ data: Role[] }>("/api/v1/roles")).data);
      } catch (caught) {
        notes.push(...errorLines(caught, "Could not load roles."));
      }
    }
    if (canAssignBranches) {
      try {
        setBranches((await api<{ data: Branch[] }>("/api/v1/branches?pageSize=100")).data);
      } catch (caught) {
        notes.push(...errorLines(caught, "Could not load branches."));
      }
    }
    if (notes.length > 0) setErrors(notes);
  }

  useEffect(() => {
    if (!auth.user) return;
    load().catch((caught: unknown) => setErrors(errorLines(caught, "Could not load users.")));
  }, [auth.user]);

  function reset() {
    setEditingId(null);
    setEmail("");
    setDisplayName("");
    setPassword("");
    setIsActive(true);
    setRoleIds([]);
    setBranchIds([]);
  }

  function loadUser(user: User) {
    setErrors([]);
    setEditingId(user.id);
    setEmail(user.email);
    setDisplayName(user.displayName);
    setPassword("");
    setIsActive(user.isActive);
    setRoleIds(user.roles.map((role) => role.id));
    setBranchIds(user.branchIds);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setErrors([]);
    const body: Record<string, unknown> = { email, displayName, isActive, roleIds, branchIds };
    if (!editingId || password.trim()) body.password = password;
    try {
      if (editingId) {
        await api(`/api/v1/users/${editingId}`, { method: "PUT", body: JSON.stringify(body) });
      } else {
        await api("/api/v1/users", { method: "POST", body: JSON.stringify(body) });
      }
      reset();
      await load();
    } catch (caught) {
      setErrors(errorLines(caught, editingId ? "Could not save the user." : "Could not create the user."));
    }
  }

  return (
    <div>
      <h1 className="page-title">Users</h1>
      <p className="lede">Leave every branch unticked to allow every branch. Tick branches to limit that person to those locations. A password is stored only as a hash and is never shown. Leave the password blank when editing to keep the current one.</p>
      {errors.length > 0 ? <div className="banner error" role="alert">{errors.map((line) => <p key={line}>{line}</p>)}</div> : null}
      {canCreate || editingId ? (
        <form className="card grid" onSubmit={onSubmit}>
          <label className="field"><span>Name</span><input value={displayName} onChange={(event) => setDisplayName(event.target.value)} required /></label>
          <label className="field"><span>Email</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
          <label className="field"><span>{editingId ? "New password" : "Password"}</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required={!editingId} autoComplete="new-password" /></label>
          {editingId ? <label className="field"><input type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} /> Active</label> : null}
          <div className="field checks">{roles.map((role) => (
            <label key={role.id}><input type="checkbox" checked={roleIds.includes(role.id)} onChange={(event) => setRoleIds(event.target.checked ? [...roleIds, role.id] : roleIds.filter((id) => id !== role.id))} /> {role.name}</label>
          ))}</div>
          {canAssignBranches ? (
            <div className="field checks">{branches.map((branch) => (
              <label key={branch.id}><input type="checkbox" checked={branchIds.includes(branch.id)} onChange={(event) => setBranchIds(event.target.checked ? [...branchIds, branch.id] : branchIds.filter((id) => id !== branch.id))} /> {branch.code} {branch.name}</label>
            ))}</div>
          ) : <p>Branch access stays unchanged. Changing it requires branches.view.</p>}
          <div className="row">
            <button className="btn" type="submit">{editingId ? "Save user" : "Create user"}</button>
            {editingId ? <button className="btn quiet" type="button" onClick={reset}>Cancel</button> : null}
          </div>
        </form>
      ) : null}
      <div className="card">
        <table>
          <thead><tr><th>Name</th><th>Email</th><th>Roles</th><th>Status</th><th></th></tr></thead>
          <tbody>{users.map((user) => (
            <tr key={user.id}>
              <td>{user.displayName}</td>
              <td>{user.email}</td>
              <td>{user.roles.map((role) => role.name).join(", ")}</td>
              <td>{user.isActive ? "Active" : "Inactive"}</td>
              <td>{canUpdate ? <button className="btn quiet" type="button" onClick={() => loadUser(user)}>Edit {user.displayName}</button> : null}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}
