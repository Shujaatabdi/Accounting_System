"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { api } from "@/lib/api/client";
import { todayIso } from "@/lib/formatting";

type ReturnRow = { id: string; returnNumber: string; customerName: string; returnDate: string; status: string; total: string; reason: string };
type Option = { id: string; code?: string; name?: string; displayName?: string };
type Invoice = { id: string; invoiceNumber: string; status: string; lines?: Array<{ id: string; description: string }> };

export default function ReturnsScreen() {
  const [rows, setRows] = useState<ReturnRow[]>([]);
  const [customers, setCustomers] = useState<Option[]>([]);
  const [branches, setBranches] = useState<Option[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [invoiceLineId, setInvoiceLineId] = useState("");
  const [lines, setLines] = useState<Array<{ id: string; label: string }>>([]);
  const [quantity, setQuantity] = useState("1");
  const [reason, setReason] = useState("");
  const [returnDate, setReturnDate] = useState(todayIso());
  const [error, setError] = useState("");

  async function load() {
    setRows((await api<{ data: ReturnRow[] }>("/api/v1/customer-returns?pageSize=100")).data);
  }

  useEffect(() => {
    Promise.all([
      load(),
      api<{ data: Option[] }>("/api/v1/customers?pageSize=100&active=true"),
      api<{ data: Option[] }>("/api/v1/branches?pageSize=100"),
    ]).then(([, customerRows, branchRows]) => {
      setCustomers(customerRows.data);
      setBranches(branchRows.data);
      if (customerRows.data[0]) setCustomerId(customerRows.data[0].id);
      if (branchRows.data[0]) setBranchId(branchRows.data[0].id);
    }).catch((caught: Error) => setError(caught.message));
  }, []);

  useEffect(() => {
    if (!customerId) return;
    api<{ data: Invoice[] }>(`/api/v1/invoices?customerId=${customerId}&status=posted&pageSize=100`)
      .then(async (result) => {
        const detailed = await Promise.all(result.data.map((row) => api<Invoice>(`/api/v1/invoices/${row.id}`)));
        const options = detailed.flatMap((invoice) => (invoice.lines ?? []).map((line) => ({ id: line.id, label: `${invoice.invoiceNumber} · ${line.description}` })));
        setLines(options);
        if (options[0]) setInvoiceLineId(options[0].id);
      })
      .catch((caught: Error) => setError(caught.message));
  }, [customerId]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      await api("/api/v1/customer-returns", {
        method: "POST",
        body: JSON.stringify({
          customerId, branchId, returnDate, reason, unreferenced: false,
          lines: [{ invoiceLineId, quantity, disposition: "restockable" }],
        }),
      });
      setReason("");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create the return.");
    }
  }

  return (
    <div>
      <h1 className="page-title">Customer returns</h1>
      <p className="lede">A linked return names one invoice line. Posted quantity and value cannot exceed what remains on that line. This phase does not change stock quantity or cost of goods sold.</p>
      {error ? <div className="banner error">{error}</div> : null}
      <form className="card grid" onSubmit={onSubmit}>
        <label className="field"><span>Customer</span>
          <select value={customerId} onChange={(event) => setCustomerId(event.target.value)}>{customers.map((row) => <option key={row.id} value={row.id}>{row.code} {row.displayName}</option>)}</select>
        </label>
        <label className="field"><span>Branch</span>
          <select value={branchId} onChange={(event) => setBranchId(event.target.value)}>{branches.map((row) => <option key={row.id} value={row.id}>{row.code} {row.name}</option>)}</select>
        </label>
        <label className="field"><span>Invoice line</span>
          <select value={invoiceLineId} onChange={(event) => setInvoiceLineId(event.target.value)}>{lines.map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}</select>
        </label>
        <label className="field"><span>Quantity</span><input value={quantity} onChange={(event) => setQuantity(event.target.value)} required /></label>
        <label className="field"><span>Date</span><input type="date" value={returnDate} onChange={(event) => setReturnDate(event.target.value)} required /></label>
        <label className="field"><span>Reason</span><input value={reason} onChange={(event) => setReason(event.target.value)} required /></label>
        <button className="btn" type="submit">Save draft return</button>
      </form>
      <div className="card">
        <table>
          <thead><tr><th>Number</th><th>Customer</th><th>Date</th><th>Status</th><th>Total</th><th>Reason</th></tr></thead>
          <tbody>{rows.map((row) => <tr key={row.id}><td><Link href={`/customer-returns/${row.id}`}>{row.returnNumber}</Link></td><td>{row.customerName}</td><td>{row.returnDate}</td><td>{row.status}</td><td>{row.total}</td><td>{row.reason}</td></tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}
