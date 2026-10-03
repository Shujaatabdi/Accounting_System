"use client";

import { FormEvent, useEffect, useState } from "react";
import { api } from "@/lib/api/client";
import { todayIso } from "@/lib/formatting";

type Account = { id: string; code: string; name: string; accountType: string };
type Tax = {
  id: string;
  code: string;
  name: string;
  ratePercent: string;
  salesAccountId: string | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  isActive: boolean;
};

export default function TaxCodesPage() {
  const [rows, setRows] = useState<Tax[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [ratePercent, setRatePercent] = useState("0");
  const [salesAccountId, setSalesAccountId] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState(todayIso());
  const [error, setError] = useState("");
  const rateRequired = Number(ratePercent) > 0;

  async function load() {
    const [taxRows, accountRows] = await Promise.all([
      api<{ data: Tax[] }>("/api/v1/tax-codes"),
      api<{ data: Account[] }>("/api/v1/accounts?postable=true&pageSize=100"),
    ]);
    setRows(taxRows.data);
    setAccounts(accountRows.data.filter((account) => account.accountType === "liability"));
  }
  useEffect(() => { load().catch((caught: Error) => setError(caught.message)); }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      await api("/api/v1/tax-codes", {
        method: "POST",
        body: JSON.stringify({ code, name, ratePercent, effectiveFrom, salesAccountId: salesAccountId || null }),
      });
      setCode("");
      setName("");
      setRatePercent("0");
      setSalesAccountId("");
      await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not create the tax code."); }
  }

  async function mapAccount(row: Tax, accountId: string) {
    setError("");
    try {
      await api(`/api/v1/tax-codes/${row.id}`, { method: "PUT", body: JSON.stringify({ salesAccountId: accountId || null }) });
      await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not save the sales tax account."); }
  }

  return (
    <div>
      <h1 className="page-title">Tax codes</h1>
      <p className="lede">A tax code stores a percentage and the date it starts. Invoices use the code selected on the line. A rate above zero needs an active liability account that is not a header. A rate change is a new effective-dated code. No country rate is verified.</p>
      {error ? <div className="banner error">{error}</div> : null}
      <form className="card row" onSubmit={onSubmit}>
        <input placeholder="Code" value={code} onChange={(event) => setCode(event.target.value)} required />
        <input placeholder="Name" value={name} onChange={(event) => setName(event.target.value)} required />
        <input placeholder="Rate %" value={ratePercent} onChange={(event) => setRatePercent(event.target.value)} required />
        <select value={salesAccountId} onChange={(event) => setSalesAccountId(event.target.value)} required={rateRequired}>
          <option value="">{rateRequired ? "Sales tax account" : "No sales tax account"}</option>
          {accounts.map((account) => <option key={account.id} value={account.id}>{account.code} {account.name}</option>)}
        </select>
        <input type="date" value={effectiveFrom} onChange={(event) => setEffectiveFrom(event.target.value)} required />
        <button className="btn" type="submit">Add tax code</button>
      </form>
      <div className="card">
        <table>
          <thead><tr><th>Code</th><th>Name</th><th>Rate</th><th>Starts</th><th>Status</th><th>Sales tax account</th></tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.code}</td>
                <td>{row.name}</td>
                <td>{row.ratePercent}%</td>
                <td>{row.effectiveFrom}</td>
                <td>{row.isActive ? "Active" : "Retired"}</td>
                <td>
                  <select value={row.salesAccountId ?? ""} onChange={(event) => mapAccount(row, event.target.value)}>
                    <option value="">No account</option>
                    {accounts.map((account) => <option key={account.id} value={account.id}>{account.code} {account.name}</option>)}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
