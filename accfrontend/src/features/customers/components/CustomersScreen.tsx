"use client";

import { FormEvent, useEffect, useState } from "react";
import { api } from "@/lib/api/client";

type Customer = {
  id: string;
  code: string;
  legalName: string;
  displayName: string;
  paymentTermsDays: number;
  creditLimit: string | null;
  isActive: boolean;
};

export default function CustomersScreen() {
  const [rows, setRows] = useState<Customer[]>([]);
  const [error, setError] = useState("");
  const [code, setCode] = useState("");
  const [legalName, setLegalName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [terms, setTerms] = useState("30");
  const [creditLimit, setCreditLimit] = useState("");

  async function load() {
    setRows((await api<{ data: Customer[] }>("/api/v1/customers?pageSize=100")).data);
  }
  useEffect(() => { load().catch((caught: Error) => setError(caught.message)); }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      await api("/api/v1/customers", {
        method: "POST",
        body: JSON.stringify({
          code, legalName, displayName, paymentTermsDays: Number(terms),
          creditLimit: creditLimit || null, isActive: true, addresses: [], contacts: [],
        }),
      });
      setCode(""); setLegalName(""); setDisplayName(""); setCreditLimit("");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save the customer.");
    }
  }

  return (
    <div>
      <h1 className="page-title">Customers</h1>
      <p className="lede">Customer balances are subledger detail. They do not create a second receivable posting.</p>
      {error ? <div className="banner error">{error}</div> : null}
      <form className="card grid" onSubmit={onSubmit}>
        <label className="field"><span>Code</span><input value={code} onChange={(event) => setCode(event.target.value)} required /></label>
        <label className="field"><span>Legal name</span><input value={legalName} onChange={(event) => setLegalName(event.target.value)} required /></label>
        <label className="field"><span>Display name</span><input value={displayName} onChange={(event) => setDisplayName(event.target.value)} required /></label>
        <label className="field"><span>Payment terms (days)</span><input value={terms} onChange={(event) => setTerms(event.target.value)} required /></label>
        <label className="field"><span>Credit limit</span><input value={creditLimit} onChange={(event) => setCreditLimit(event.target.value)} placeholder="Blank means no limit" /></label>
        <button className="btn" type="submit">Add customer</button>
      </form>
      <div className="card">
        <table>
          <thead><tr><th>Code</th><th>Name</th><th>Terms</th><th>Credit limit</th><th>Status</th></tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}><td>{row.code}</td><td>{row.displayName}</td><td>{row.paymentTermsDays}</td><td>{row.creditLimit ?? "No limit"}</td><td>{row.isActive ? "Active" : "Inactive"}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
