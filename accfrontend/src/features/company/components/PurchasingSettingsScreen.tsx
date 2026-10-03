"use client";

import { FormEvent, useEffect, useState } from "react";
import { api } from "@/lib/api/client";

type Account = { id: string; code: string; name: string; accountType: string };
type Settings = {
  taxPricingMode: "exclusive" | "inclusive";
  discountTreatment: string;
  apControlAccountId: string | null;
  supplierAdvanceAccountId: string | null;
  showSupplierTaxIdentifiers: boolean;
};

export default function PurchasingSettingsScreen() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");

  useEffect(() => {
    Promise.all([
      api<Settings>("/api/v1/purchasing-settings"),
      api<{ data: Account[] }>("/api/v1/accounts?postable=true&pageSize=100"),
    ]).then(([current, accountRows]) => {
      setSettings(current);
      setAccounts(accountRows.data);
    }).catch((caught: Error) => setError(caught.message));
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!settings?.apControlAccountId) return;
    setError("");
    setSaved("");
    try {
      setSettings(await api<Settings>("/api/v1/purchasing-settings", { method: "PUT", body: JSON.stringify(settings) }));
      setSaved("Purchasing settings saved.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save purchasing settings.");
    }
  }

  if (!settings) return <p>{error || "Loading…"}</p>;
  const liabilities = accounts.filter((account) => account.accountType === "liability");
  const assets = accounts.filter((account) => account.accountType === "asset");
  return (
    <div>
      <h1 className="page-title">Purchasing settings</h1>
      <p className="lede">Bill tax and discounts follow these settings. They are separate from sales settings. The country code does not choose a tax regime. A payment that is not fully applied to bills stays blocked until a supplier advance asset account is selected. Stock quantity and inventory value are not posted.</p>
      {error ? <div className="banner error">{error}</div> : null}
      {saved ? <div className="banner">{saved}</div> : null}
      <form className="card grid" onSubmit={onSubmit}>
        <label className="field"><span>Tax pricing</span>
          <select value={settings.taxPricingMode} onChange={(event) => setSettings({ ...settings, taxPricingMode: event.target.value as Settings["taxPricingMode"] })}>
            <option value="exclusive">Tax exclusive</option>
            <option value="inclusive">Tax inclusive</option>
          </select>
        </label>
        <label className="field"><span>Payable control</span>
          <select value={settings.apControlAccountId ?? ""} onChange={(event) => setSettings({ ...settings, apControlAccountId: event.target.value })} required>
            {liabilities.map((account) => <option key={account.id} value={account.id}>{account.code} {account.name}</option>)}
          </select>
        </label>
        <label className="field"><span>Supplier advances</span>
          <select value={settings.supplierAdvanceAccountId ?? ""} onChange={(event) => setSettings({ ...settings, supplierAdvanceAccountId: event.target.value || null })}>
            <option value="">Not selected</option>
            {assets.map((account) => <option key={account.id} value={account.id}>{account.code} {account.name}</option>)}
          </select>
        </label>
        <label className="field"><span>Show supplier tax identifiers</span>
          <select value={settings.showSupplierTaxIdentifiers ? "yes" : "no"} onChange={(event) => setSettings({ ...settings, showSupplierTaxIdentifiers: event.target.value === "yes" })}>
            <option value="no">Off</option>
            <option value="yes">On</option>
          </select>
        </label>
        <p>Discount treatment: {settings.discountTreatment}. A line discount reduces the taxable base.</p>
        <button className="btn" type="submit">Save</button>
      </form>
    </div>
  );
}
