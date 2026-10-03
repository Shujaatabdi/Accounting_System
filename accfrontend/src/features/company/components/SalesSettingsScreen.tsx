"use client";

import { FormEvent, useEffect, useState } from "react";
import { api } from "@/lib/api/client";

type Account = { id: string; code: string; name: string; accountType: string };
type Settings = {
  taxPricingMode: "exclusive" | "inclusive";
  discountTreatment: string;
  unappliedReceiptTreatment: "customer_advance" | "credit_ar";
  arControlAccountId: string | null;
  customerAdvanceAccountId: string | null;
  showCustomerTaxIdentifiers: boolean;
};

export default function SalesSettingsScreen() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");

  useEffect(() => {
    Promise.all([
      api<Settings>("/api/v1/sales-settings"),
      api<{ data: Account[] }>("/api/v1/accounts?postable=true&pageSize=100"),
    ]).then(([current, accountRows]) => {
      setSettings(current);
      setAccounts(accountRows.data);
    }).catch((caught: Error) => setError(caught.message));
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!settings?.arControlAccountId) return;
    setError("");
    setSaved("");
    try {
      setSettings(await api<Settings>("/api/v1/sales-settings", { method: "PUT", body: JSON.stringify(settings) }));
      setSaved("Sales settings saved.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save sales settings.");
    }
  }

  if (!settings) return <p>{error || "Loading…"}</p>;
  const assets = accounts.filter((account) => account.accountType === "asset");
  const liabilities = accounts.filter((account) => account.accountType === "liability");
  return (
    <div>
      <h1 className="page-title">Sales settings</h1>
      <p className="lede">Tax and discounts follow these company settings. The country code does not choose a tax regime. Receipts stay blocked until a customer advance account is selected when that treatment is in use.</p>
      {error ? <div className="banner error">{error}</div> : null}
      {saved ? <div className="banner">{saved}</div> : null}
      <form className="card grid" onSubmit={onSubmit}>
        <label className="field"><span>Tax pricing</span>
          <select value={settings.taxPricingMode} onChange={(event) => setSettings({ ...settings, taxPricingMode: event.target.value as Settings["taxPricingMode"] })}>
            <option value="exclusive">Tax exclusive</option>
            <option value="inclusive">Tax inclusive</option>
          </select>
        </label>
        <label className="field"><span>Unapplied receipts</span>
          <select value={settings.unappliedReceiptTreatment} onChange={(event) => setSettings({ ...settings, unappliedReceiptTreatment: event.target.value as Settings["unappliedReceiptTreatment"] })}>
            <option value="customer_advance">Customer advance liability</option>
            <option value="credit_ar">Credit accounts receivable</option>
          </select>
        </label>
        <label className="field"><span>Receivable control</span>
          <select value={settings.arControlAccountId ?? ""} onChange={(event) => setSettings({ ...settings, arControlAccountId: event.target.value })} required>
            {assets.map((account) => <option key={account.id} value={account.id}>{account.code} {account.name}</option>)}
          </select>
        </label>
        <label className="field"><span>Customer advances</span>
          <select value={settings.customerAdvanceAccountId ?? ""} onChange={(event) => setSettings({ ...settings, customerAdvanceAccountId: event.target.value || null })}>
            <option value="">Not selected</option>
            {liabilities.map((account) => <option key={account.id} value={account.id}>{account.code} {account.name}</option>)}
          </select>
        </label>
        <label className="field"><span>Show customer tax identifiers</span>
          <select value={settings.showCustomerTaxIdentifiers ? "yes" : "no"} onChange={(event) => setSettings({ ...settings, showCustomerTaxIdentifiers: event.target.value === "yes" })}>
            <option value="no">Off</option>
            <option value="yes">On</option>
          </select>
        </label>
        <p>When this is on, posting an invoice keeps a copy of the customer tax details that exist at that moment. Later customer edits do not change a posted invoice. Turning it off hides the details and keeps the copy. These details are not claimed to be legally required.</p>
        <p>Line discounts use the stored rule: {settings.discountTreatment}.</p>
        <button className="btn" type="submit">Save sales settings</button>
      </form>
    </div>
  );
}
