"use client";

import { FormEvent, useEffect, useState } from "react";
import { api } from "@/lib/api/client";
import { todayIso } from "@/lib/formatting";

type Tax = { id: string; code: string; name: string; ratePercent: string; effectiveFrom: string; effectiveTo: string | null; isActive: boolean };

export default function TaxCodesPage() {
  const [rows, setRows] = useState<Tax[]>([]);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [ratePercent, setRatePercent] = useState("0");
  const [effectiveFrom, setEffectiveFrom] = useState(todayIso());
  const [error, setError] = useState("");
  async function load() { setRows((await api<{ data: Tax[] }>("/api/v1/tax-codes")).data); }
  useEffect(() => { load().catch((caught: Error) => setError(caught.message)); }, []);
  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    try {
      await api("/api/v1/tax-codes", { method: "POST", body: JSON.stringify({ code, name, ratePercent, effectiveFrom }) });
      await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not create the tax code."); }
  }
  return (
    <div>
      <h1 className="page-title">Tax codes</h1>
      <p className="lede">Tax codes are configuration only in this phase. They are not calculated on invoices yet. Rates are percentages, and a rate change is a new effective-dated version. No country rate is verified.</p>
      {error ? <div className="banner error">{error}</div> : null}
      <form className="card row" onSubmit={onSubmit}>
        <input placeholder="Code" value={code} onChange={(event) => setCode(event.target.value)} required />
        <input placeholder="Name" value={name} onChange={(event) => setName(event.target.value)} required />
        <input placeholder="Rate %" value={ratePercent} onChange={(event) => setRatePercent(event.target.value)} required />
        <input type="date" value={effectiveFrom} onChange={(event) => setEffectiveFrom(event.target.value)} required />
        <button className="btn" type="submit">Add tax code</button>
      </form>
      <div className="card"><table><tbody>{rows.map((row) => <tr key={row.id}><td>{row.code}</td><td>{row.name}</td><td>{row.ratePercent}%</td><td>{row.effectiveFrom}</td><td>{row.isActive ? "Active" : "Retired"}</td></tr>)}</tbody></table></div>
    </div>
  );
}
