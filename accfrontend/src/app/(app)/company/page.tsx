"use client";

import { FormEvent, useEffect, useState } from "react";
import { api } from "@/lib/api";

type Company = {
  legalName: string;
  displayName: string;
  countryCode: string;
  taxIdentifier: string | null;
  timezone: string;
  currencyName: string;
  currencySymbol: string;
  currencyDecimalPlaces: number;
  fiscalYearStartMonth: number;
  requireDistinctApprover: boolean;
  logoUrl: string | null;
  notes: string | null;
  addresses: Address[];
  contacts: Contact[];
  profilePlaceholder: boolean;
};
type Address = { id?: string; addressType: string; line1: string; line2?: string | null; city?: string | null; region?: string | null; postalCode?: string | null; countryCode: string; isPrimary: boolean };
type Contact = { id?: string; name: string; roleTitle?: string | null; phone?: string | null; email?: string | null; isPrimary: boolean };

export default function CompanyPage() {
  const [company, setCompany] = useState<Company | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    api<Company>("/api/v1/company").then(setCompany).catch((caught: Error) => setError(caught.message));
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!company) return;
    setError("");
    setMessage("");
    try {
      const payload = {
        ...company,
        taxIdentifier: company.taxIdentifier || null,
        logoUrl: company.logoUrl || null,
        notes: company.notes || null,
        addresses: company.addresses.map((address) => ({
          ...address,
          line2: address.line2 || null,
          city: address.city || null,
          region: address.region || null,
          postalCode: address.postalCode || null,
        })),
        contacts: company.contacts.map((contact) => ({
          ...contact,
          roleTitle: contact.roleTitle || null,
          phone: contact.phone || null,
          email: contact.email || null,
        })),
      };
      const saved = await api<Company>("/api/v1/company", { method: "PUT", body: JSON.stringify(payload) });
      setCompany(saved);
      setMessage("Company profile saved.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Save failed.");
    }
  }

  if (!company) return error ? <div className="banner error">{error}</div> : <p>Loading company…</p>;
  return (
    <form onSubmit={onSubmit}>
      <h1 className="page-title">Company</h1>
      <p className="lede">One installation, one company, one currency. Currency name, symbol, and decimal places lock after the first posted journal.</p>
      {company.profilePlaceholder ? <div className="banner warn">Replace the placeholder name and country code. Use the ISO country code, not a hard-coded tax regime.</div> : null}
      {error ? <div className="banner error">{error}</div> : null}
      {message ? <div className="banner ok">{message}</div> : null}
      <div className="card grid">
        <Field label="Legal name" value={company.legalName} onChange={(value) => setCompany({ ...company, legalName: value })} />
        <Field label="Display name" value={company.displayName} onChange={(value) => setCompany({ ...company, displayName: value })} />
        <Field label="Country code" value={company.countryCode} onChange={(value) => setCompany({ ...company, countryCode: value.toUpperCase() })} />
        <Field label="Tax identifier" value={company.taxIdentifier ?? ""} onChange={(value) => setCompany({ ...company, taxIdentifier: value })} />
        <Field label="Time zone" value={company.timezone} onChange={(value) => setCompany({ ...company, timezone: value })} />
        <Field label="Currency name" value={company.currencyName} onChange={(value) => setCompany({ ...company, currencyName: value })} />
        <Field label="Currency symbol" value={company.currencySymbol} onChange={(value) => setCompany({ ...company, currencySymbol: value })} />
        <label className="field"><span>Decimal places</span>
          <input type="number" min={0} max={4} value={company.currencyDecimalPlaces} onChange={(event) => setCompany({ ...company, currencyDecimalPlaces: Number(event.target.value) })} />
        </label>
        <label className="field"><span>Fiscal year start month</span>
          <input type="number" min={1} max={12} value={company.fiscalYearStartMonth} onChange={(event) => setCompany({ ...company, fiscalYearStartMonth: Number(event.target.value) })} />
        </label>
        <Field label="Logo URL" value={company.logoUrl ?? ""} onChange={(value) => setCompany({ ...company, logoUrl: value })} />
        <label className="field full"><span>Notes</span><textarea value={company.notes ?? ""} onChange={(event) => setCompany({ ...company, notes: event.target.value })} /></label>
        <label className="field full checks"><input type="checkbox" checked={company.requireDistinctApprover} onChange={(event) => setCompany({ ...company, requireDistinctApprover: event.target.checked })} /> Require a different person to approve a journal</label>
      </div>
      <AddressEditor company={company} setCompany={setCompany} />
      <ContactEditor company={company} setCompany={setCompany} />
      <button className="btn" type="submit">Save company</button>
    </form>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="field"><span>{label}</span><input value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

function AddressEditor({ company, setCompany }: { company: Company; setCompany: (company: Company) => void }) {
  return (
    <div className="card">
      <div className="row">
        <strong>Addresses</strong>
        <button className="btn quiet" type="button" onClick={() => setCompany({ ...company, addresses: [...company.addresses, { addressType: "registered", line1: "", countryCode: company.countryCode, isPrimary: company.addresses.length === 0 }] })}>Add address</button>
      </div>
      {company.addresses.map((address, index) => (
        <div className="grid" key={address.id ?? index} style={{ marginTop: 12 }}>
          <label className="field"><span>Type</span>
            <select value={address.addressType} onChange={(event) => updateAddress(index, { addressType: event.target.value })}>
              <option value="registered">Registered</option>
              <option value="billing">Billing</option>
              <option value="other">Other</option>
            </select>
          </label>
          <Field label="Line 1" value={address.line1} onChange={(value) => updateAddress(index, { line1: value })} />
          <Field label="City" value={address.city ?? ""} onChange={(value) => updateAddress(index, { city: value })} />
          <Field label="Country" value={address.countryCode} onChange={(value) => updateAddress(index, { countryCode: value.toUpperCase() })} />
        </div>
      ))}
    </div>
  );

  function updateAddress(index: number, patch: Partial<Address>) {
    const addresses = company.addresses.map((address, item) => item === index ? { ...address, ...patch } : address);
    setCompany({ ...company, addresses });
  }
}

function ContactEditor({ company, setCompany }: { company: Company; setCompany: (company: Company) => void }) {
  return (
    <div className="card">
      <div className="row">
        <strong>Contacts</strong>
        <button className="btn quiet" type="button" onClick={() => setCompany({ ...company, contacts: [...company.contacts, { name: "", isPrimary: company.contacts.length === 0 }] })}>Add contact</button>
      </div>
      {company.contacts.map((contact, index) => (
        <div className="grid" key={contact.id ?? index} style={{ marginTop: 12 }}>
          <Field label="Name" value={contact.name} onChange={(value) => update(index, { name: value })} />
          <Field label="Phone" value={contact.phone ?? ""} onChange={(value) => update(index, { phone: value })} />
          <Field label="Email" value={contact.email ?? ""} onChange={(value) => update(index, { email: value })} />
        </div>
      ))}
    </div>
  );

  function update(index: number, patch: Partial<Contact>) {
    setCompany({ ...company, contacts: company.contacts.map((contact, item) => item === index ? { ...contact, ...patch } : contact) });
  }
}
