"use client";

import { FormEvent, useEffect, useState } from "react";
import { api } from "@/lib/api";

type Branch = { id: string; code: string; name: string; isActive: boolean; city: string | null };

export default function BranchesPage() {
  const [rows, setRows] = useState<Branch[]>([]);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  async function load() {
    setRows((await api<{ data: Branch[] }>("/api/v1/branches?pageSize=100")).data);
  }
  useEffect(() => { load().catch((caught: Error) => setError(caught.message)); }, []);
  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    try {
      await api("/api/v1/branches", { method: "POST", body: JSON.stringify({ code, name, isActive: true }) });
      setCode(""); setName(""); await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not create the branch."); }
  }
  return (
    <div>
      <h1 className="page-title">Branches</h1>
      <p className="lede">Branch scope applies when a user is assigned one or more branches. Company admins always see every branch.</p>
      {error ? <div className="banner error">{error}</div> : null}
      <form className="card row" onSubmit={onSubmit}>
        <input placeholder="Code" value={code} onChange={(event) => setCode(event.target.value)} required />
        <input placeholder="Name" value={name} onChange={(event) => setName(event.target.value)} required />
        <button className="btn" type="submit">Add branch</button>
      </form>
      <div className="card"><table><tbody>{rows.map((row) => <tr key={row.id}><td>{row.code}</td><td>{row.name}</td><td>{row.isActive ? "Active" : "Inactive"}</td></tr>)}</tbody></table></div>
    </div>
  );
}
