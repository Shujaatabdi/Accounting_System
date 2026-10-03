"use client";

import { FormEvent, useEffect, useState } from "react";
import { api } from "@/lib/api/client";

type Address = { addressType: "billing"; line1: string; countryCode: string; isPrimary: boolean };
type Contact = { name: string; isPrimary: boolean };
type Supplier = {
  id: string;
  code: string;
  legalName: string;
  displayName: string;
  paymentTermsDays: number;
  isActive: boolean;
  taxIdentifier: string | null;
  taxCountryCode: string | null;
  partyType: "individual" | "company" | "aop" | null;
  cnicNtn: string | null;
  cnicNtnDisplay: string | null;
  strn: string | null;
  addresses: Address[];
  contacts: Contact[];
};
type History = { kind: string; number: string; doc_date: string; status: string; total: string };
type ProductLink = { sku: string; productName: string; supplierItemCode: string | null; purchasePrice: string; leadTimeDays: number; isPreferred: boolean };

const emptyForm = {
  code: "",
  legalName: "",
  displayName: "",
  terms: "30",
  taxIdentifier: "",
  taxCountryCode: "",
  partyType: "company" as "individual" | "company" | "aop",
  cnicNtn: "",
  strn: "",
  isActive: true,
  addressLine: "",
  addressCountry: "",
  contactName: "",
};

export default function SuppliersScreen() {
  const [rows, setRows] = useState<Supplier[]>([]);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [balance, setBalance] = useState("");
  const [history, setHistory] = useState<History[]>([]);
  const [products, setProducts] = useState<ProductLink[]>([]);
  const pakistan = form.taxCountryCode.trim().toUpperCase() === "PK";

  async function load() {
    setRows((await api<{ data: Supplier[] }>("/api/v1/suppliers?pageSize=100")).data);
  }
  useEffect(() => { load().catch((caught: Error) => setError(caught.message)); }, []);

  function reset() {
    setEditingId(null);
    setForm(emptyForm);
    setBalance("");
    setHistory([]);
    setProducts([]);
  }

  async function edit(id: string) {
    setError("");
    try {
      const supplier = await api<Supplier>(`/api/v1/suppliers/${id}`);
      const [bal, hist, linked] = await Promise.all([
        api<{ payables: string; advances: string }>(`/api/v1/suppliers/${id}/balance`),
        api<{ data: History[] }>(`/api/v1/suppliers/${id}/history?pageSize=20`),
        api<{ data: ProductLink[] }>(`/api/v1/suppliers/${id}/products`),
      ]);
      setEditingId(id);
      setBalance(`Payables ${bal.payables}. Unapplied advances ${bal.advances}. Advances are not part of bill aging.`);
      setHistory(hist.data);
      setProducts(linked.data);
      setForm({
        code: supplier.code,
        legalName: supplier.legalName,
        displayName: supplier.displayName,
        terms: String(supplier.paymentTermsDays),
        taxIdentifier: supplier.taxIdentifier ?? "",
        taxCountryCode: supplier.taxCountryCode ?? "",
        partyType: supplier.partyType ?? "company",
        cnicNtn: supplier.cnicNtnDisplay ?? supplier.cnicNtn ?? "",
        strn: supplier.strn ?? "",
        isActive: supplier.isActive,
        addressLine: supplier.addresses[0]?.line1 ?? "",
        addressCountry: supplier.addresses[0]?.countryCode ?? "",
        contactName: supplier.contacts[0]?.name ?? "",
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not open the supplier.");
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    const addresses = form.addressLine && form.addressCountry
      ? [{ addressType: "billing" as const, line1: form.addressLine, countryCode: form.addressCountry, isPrimary: true }]
      : [];
    const contacts = form.contactName ? [{ name: form.contactName, isPrimary: true }] : [];
    const body = {
      code: form.code,
      legalName: form.legalName,
      displayName: form.displayName,
      paymentTermsDays: Number(form.terms),
      isActive: form.isActive,
      taxIdentifier: form.taxIdentifier || null,
      taxCountryCode: form.taxCountryCode || null,
      partyType: pakistan ? form.partyType : null,
      cnicNtn: pakistan ? form.cnicNtn : null,
      strn: pakistan ? form.strn || null : null,
      addresses,
      contacts,
    };
    try {
      if (editingId) await api(`/api/v1/suppliers/${editingId}`, { method: "PUT", body: JSON.stringify(body) });
      else await api("/api/v1/suppliers", { method: "POST", body: JSON.stringify(body) });
      reset();
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save the supplier.");
    }
  }

  return (
    <div>
      <h1 className="page-title">Suppliers</h1>
      <p className="lede">Supplier balances are subledger detail. They do not create a second payable posting. A tax country does not choose a tax rate. ATL and FBR connections are not stored.</p>
      {error ? <div className="banner error">{error}</div> : null}
      <form className="card grid" onSubmit={onSubmit}>
        <label className="field"><span>Code</span><input value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} required /></label>
        <label className="field"><span>Legal name</span><input value={form.legalName} onChange={(event) => setForm({ ...form, legalName: event.target.value })} required /></label>
        <label className="field"><span>Display name</span><input value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} required /></label>
        <label className="field"><span>Payment terms (days)</span><input value={form.terms} onChange={(event) => setForm({ ...form, terms: event.target.value })} required /></label>
        <label className="field"><span>Status</span>
          <select value={form.isActive ? "active" : "inactive"} onChange={(event) => setForm({ ...form, isActive: event.target.value === "active" })}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </label>
        <label className="field"><span>Tax country</span><input value={form.taxCountryCode} onChange={(event) => setForm({ ...form, taxCountryCode: event.target.value })} placeholder="PK" maxLength={2} /></label>
        <label className="field"><span>Tax identifier</span><input value={form.taxIdentifier} onChange={(event) => setForm({ ...form, taxIdentifier: event.target.value })} placeholder="Optional generic identifier" /></label>
        {pakistan ? (
          <>
            <label className="field"><span>Party type</span>
              <select value={form.partyType} onChange={(event) => setForm({ ...form, partyType: event.target.value as typeof form.partyType })}>
                <option value="individual">Individual</option>
                <option value="company">Company</option>
                <option value="aop">AOP</option>
              </select>
            </label>
            <label className="field"><span>CNIC/NTN</span><input value={form.cnicNtn} onChange={(event) => setForm({ ...form, cnicNtn: event.target.value })} required /></label>
            <p>An individual CNIC is 13 digits. A company or AOP NTN is 7 digits, or the printed form 1234567-8. The check digit is stored for display and is not verified.</p>
            <label className="field"><span>STRN</span><input value={form.strn} onChange={(event) => setForm({ ...form, strn: event.target.value })} placeholder="Optional" /></label>
          </>
        ) : null}
        <label className="field"><span>Billing address</span><input value={form.addressLine} onChange={(event) => setForm({ ...form, addressLine: event.target.value })} /></label>
        <label className="field"><span>Address country</span><input value={form.addressCountry} onChange={(event) => setForm({ ...form, addressCountry: event.target.value })} maxLength={2} placeholder="PK" /></label>
        <label className="field"><span>Primary contact</span><input value={form.contactName} onChange={(event) => setForm({ ...form, contactName: event.target.value })} /></label>
        <div className="row">
          <button className="btn" type="submit">{editingId ? "Save supplier" : "Add supplier"}</button>
          {editingId ? <button className="btn" type="button" onClick={reset}>Cancel</button> : null}
        </div>
      </form>
      {editingId ? (
        <div className="card">
          <p>{balance}</p>
          <h2>Products</h2>
          <table>
            <thead><tr><th>SKU</th><th>Name</th><th>Item code</th><th>Price</th><th>Lead time</th><th>Preferred</th></tr></thead>
            <tbody>{products.map((row) => <tr key={row.sku}><td>{row.sku}</td><td>{row.productName}</td><td>{row.supplierItemCode ?? ""}</td><td>{row.purchasePrice}</td><td>{row.leadTimeDays}</td><td>{row.isPreferred ? "Yes" : ""}</td></tr>)}</tbody>
          </table>
          <h2>Transactions</h2>
          <table>
            <thead><tr><th>Kind</th><th>Number</th><th>Date</th><th>Status</th><th>Total</th></tr></thead>
            <tbody>{history.map((row) => <tr key={`${row.kind}-${row.number}`}><td>{row.kind}</td><td>{row.number}</td><td>{row.doc_date}</td><td>{row.status}</td><td>{row.total}</td></tr>)}</tbody>
          </table>
        </div>
      ) : null}
      <div className="card">
        <table>
          <thead><tr><th>Code</th><th>Name</th><th>Tax country</th><th>CNIC/NTN</th><th>Terms</th><th>Status</th></tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} onClick={() => edit(row.id)}>
                <td>{row.code}</td><td>{row.displayName}</td><td>{row.taxCountryCode ?? ""}</td><td>{row.cnicNtnDisplay ?? ""}</td><td>{row.paymentTermsDays}</td><td>{row.isActive ? "Active" : "Inactive"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
