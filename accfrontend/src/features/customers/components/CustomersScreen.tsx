"use client";

import { FormEvent, useEffect, useState } from "react";
import { AtlRecordPanel, type AtlRecord } from "@/components/AtlRecord";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/lib/api/client";
import { can } from "@/lib/auth/session";

type Address = {
  addressType: "billing" | "shipping" | "other";
  line1: string;
  line2?: string | null;
  city?: string | null;
  region?: string | null;
  postalCode?: string | null;
  countryCode: string;
  isPrimary: boolean;
};
type Contact = {
  name: string;
  roleTitle?: string | null;
  phone?: string | null;
  email?: string | null;
  isPrimary: boolean;
};
type Customer = {
  id: string;
  code: string;
  legalName: string;
  displayName: string;
  paymentTermsDays: number;
  creditLimit: string | null;
  isActive: boolean;
  taxIdentifier: string | null;
  taxCountryCode: string | null;
  partyType: "individual" | "company" | "aop" | null;
  cnicNtn: string | null;
  cnicNtnDisplay: string | null;
  strn: string | null;
  atlApplicable: boolean;
  atl: AtlRecord;
  addresses: Address[];
  contacts: Contact[];
};

const emptyForm = {
  code: "",
  legalName: "",
  displayName: "",
  terms: "30",
  creditLimit: "",
  taxIdentifier: "",
  taxCountryCode: "",
  partyType: "company" as "individual" | "company" | "aop",
  cnicNtn: "",
  strn: "",
  isActive: true,
};

export default function CustomersScreen() {
  const auth = useAuth();
  const [rows, setRows] = useState<Customer[]>([]);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [atlApplicable, setAtlApplicable] = useState(false);
  const [atl, setAtl] = useState<AtlRecord>(null);
  const pakistan = form.taxCountryCode.trim().toUpperCase() === "PK";

  async function load() {
    setRows((await api<{ data: Customer[] }>("/api/v1/customers?pageSize=100")).data);
  }
  useEffect(() => { load().catch((caught: Error) => setError(caught.message)); }, []);

  function reset() {
    setEditingId(null);
    setAddresses([]);
    setContacts([]);
    setForm(emptyForm);
    setAtlApplicable(false);
    setAtl(null);
  }

  async function edit(id: string) {
    setError("");
    try {
      const customer = await api<Customer>(`/api/v1/customers/${id}`);
      setEditingId(id);
      setAtlApplicable(customer.atlApplicable);
      setAtl(customer.atl);
      setAddresses(customer.addresses);
      setContacts(customer.contacts);
      setForm({
        code: customer.code,
        legalName: customer.legalName,
        displayName: customer.displayName,
        terms: String(customer.paymentTermsDays),
        creditLimit: customer.creditLimit ?? "",
        taxIdentifier: customer.taxIdentifier ?? "",
        taxCountryCode: customer.taxCountryCode ?? "",
        partyType: customer.partyType ?? "company",
        cnicNtn: customer.cnicNtnDisplay ?? customer.cnicNtn ?? "",
        strn: customer.strn ?? "",
        isActive: customer.isActive,
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not open the customer.");
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    const body = {
      code: form.code,
      legalName: form.legalName,
      displayName: form.displayName,
      paymentTermsDays: Number(form.terms),
      creditLimit: form.creditLimit || null,
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
      if (editingId) {
        await api(`/api/v1/customers/${editingId}`, { method: "PUT", body: JSON.stringify(body) });
      } else {
        await api("/api/v1/customers", { method: "POST", body: JSON.stringify(body) });
      }
      reset();
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save the customer.");
    }
  }

  async function saveAtl(body: { status: "active" | "inactive" | null; checkedAt?: string; reference?: string }) {
    if (!editingId) return;
    setError("");
    try {
      const saved = await api<Customer>(`/api/v1/customers/${editingId}/atl`, { method: "PUT", body: JSON.stringify(body) });
      setAtlApplicable(saved.atlApplicable);
      setAtl(saved.atl);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save the ATL record.");
    }
  }

  return (
    <div>
      <h1 className="page-title">Customers</h1>
      <p className="lede">Customer balances are subledger detail. They do not create a second receivable posting. A tax country does not choose a tax rate.</p>
      {error ? <div className="banner error">{error}</div> : null}
      <form className="card grid" onSubmit={onSubmit}>
        <label className="field"><span>Code</span><input value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} required /></label>
        <label className="field"><span>Legal name</span><input value={form.legalName} onChange={(event) => setForm({ ...form, legalName: event.target.value })} required /></label>
        <label className="field"><span>Display name</span><input value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} required /></label>
        <label className="field"><span>Payment terms (days)</span><input value={form.terms} onChange={(event) => setForm({ ...form, terms: event.target.value })} required /></label>
        <label className="field"><span>Credit limit</span><input value={form.creditLimit} onChange={(event) => setForm({ ...form, creditLimit: event.target.value })} placeholder="Blank means no limit" /></label>
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
            <label className="field"><span>CNIC/NTN</span>
              <input value={form.cnicNtn} onChange={(event) => setForm({ ...form, cnicNtn: event.target.value })} required />
            </label>
            <p>An individual CNIC is 13 digits. Spaces and hyphens are ignored. A company or AOP NTN is 7 digits, or the printed form 1234567-8. The check digit is stored for display and is not verified.</p>
            <label className="field"><span>STRN</span><input value={form.strn} onChange={(event) => setForm({ ...form, strn: event.target.value })} placeholder="Optional" /></label>
          </>
        ) : null}
        <div className="row">
          <button className="btn" type="submit">{editingId ? "Save customer" : "Add customer"}</button>
          {editingId ? <button className="btn" type="button" onClick={reset}>Cancel</button> : null}
        </div>
      </form>
      {editingId && atlApplicable && pakistan ? (
        <AtlRecordPanel record={atl} canRecord={can(auth.user, "customers.record_atl")} onSave={saveAtl} />
      ) : null}
      {editingId && atl && !(atlApplicable && pakistan) ? (
        <p>The stored ATL record is kept. It is hidden because ATL applies only when the company country and this tax country are both Pakistan. Saving the customer does not delete it.</p>
      ) : null}
      <div className="card">
        <table>
          <thead><tr><th>Code</th><th>Name</th><th>Tax country</th><th>CNIC/NTN</th><th>Terms</th><th>Credit limit</th><th>Status</th></tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} onClick={() => edit(row.id)}>
                <td>{row.code}</td><td>{row.displayName}</td><td>{row.taxCountryCode ?? ""}</td><td>{row.cnicNtnDisplay ?? ""}</td>
                <td>{row.paymentTermsDays}</td><td>{row.creditLimit ?? "No limit"}</td><td>{row.isActive ? "Active" : "Inactive"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
