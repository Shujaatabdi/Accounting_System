"use client";

import { FormEvent, useEffect, useState } from "react";
import { api } from "@/lib/api/client";

type Account = {
  id: string;
  code: string;
  name: string;
  accountType: "asset" | "liability" | "equity" | "income" | "expense";
  accountSubtype: string | null;
  parentId: string | null;
  isHeader: boolean;
  isControl: boolean;
  isActive: boolean;
  isSystem: boolean;
  normalBalance: string;
  description: string | null;
};

const empty: {
  code: string;
  name: string;
  accountType: Account["accountType"];
  accountSubtype: string;
  parentId: string;
  isHeader: boolean;
  isControl: boolean;
  isActive: boolean;
  description: string;
} = {
  code: "",
  name: "",
  accountType: "asset",
  accountSubtype: "",
  parentId: "",
  isHeader: false,
  isControl: false,
  isActive: true,
  description: "",
};

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [form, setForm] = useState(empty);
  const [error, setError] = useState("");

  async function load() {
    const result = await api<{ data: Account[] }>("/api/v1/accounts?pageSize=100");
    setAccounts(result.data);
  }
  useEffect(() => { load().catch((caught: Error) => setError(caught.message)); }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      await api("/api/v1/accounts", {
        method: "POST",
        body: JSON.stringify({ ...form, accountSubtype: form.accountSubtype || null, parentId: form.parentId || null, description: form.description || null }),
      });
      setForm(empty);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create the account.");
    }
  }

  return (
    <div>
      <h1 className="page-title">Chart of accounts</h1>
      <p className="lede">Header accounts and inactive accounts cannot receive postings. The starter chart is generic, not a statutory template.</p>
      {error ? <div className="banner error">{error}</div> : null}
      <form className="card grid" onSubmit={onSubmit}>
        <label className="field"><span>Code</span><input value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} required /></label>
        <label className="field"><span>Name</span><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></label>
        <label className="field"><span>Type</span>
          <select value={form.accountType} onChange={(event) => setForm({ ...form, accountType: event.target.value as Account["accountType"] })}>
            {["asset", "liability", "equity", "income", "expense"].map((type) => <option key={type}>{type}</option>)}
          </select>
        </label>
        <label className="field"><span>Parent</span>
          <select value={form.parentId} onChange={(event) => setForm({ ...form, parentId: event.target.value })}>
            <option value="">None</option>
            {accounts.filter((account) => account.isHeader && account.accountType === form.accountType).map((account) => <option key={account.id} value={account.id}>{account.code} {account.name}</option>)}
          </select>
        </label>
        <label className="checks"><input type="checkbox" checked={form.isHeader} onChange={(event) => setForm({ ...form, isHeader: event.target.checked })} /> Header</label>
        <label className="checks"><input type="checkbox" checked={form.isControl} onChange={(event) => setForm({ ...form, isControl: event.target.checked })} /> Control account</label>
        <button className="btn" type="submit">Add account</button>
      </form>
      <div className="card">
        <table>
          <thead><tr><th>Code</th><th>Name</th><th>Type</th><th>Normal</th><th>Status</th></tr></thead>
          <tbody>
            {accounts.map((account) => (
              <tr key={account.id}>
                <td>{account.code}</td>
                <td>{account.name}</td>
                <td>{account.accountType}</td>
                <td>{account.normalBalance}</td>
                <td>{account.isHeader ? "Header" : account.isActive ? "Active" : "Inactive"}{account.isSystem ? " · System" : ""}{account.isControl ? " · Control" : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
