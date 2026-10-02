"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api/client";

type Line = { id: string; description: string; quantity: string; unitPrice: string; taxAmount: string; lineTotal: string };
type Invoice = {
  id: string;
  invoiceNumber: string;
  customerName: string;
  status: string;
  invoiceDate: string;
  dueDate: string;
  total: string;
  taxTotal: string;
  lines: Line[];
};

export default function InvoiceDetailScreen({ id }: { id: string }) {
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [error, setError] = useState("");
  const [reason, setReason] = useState("");

  async function load() {
    setInvoice(await api<Invoice>(`/api/v1/invoices/${id}`));
  }
  useEffect(() => { load().catch((caught: Error) => setError(caught.message)); }, [id]);

  async function act(path: string, body?: unknown) {
    setError("");
    try {
      setInvoice(await api<Invoice>(`/api/v1/invoices/${id}/${path}`, { method: "POST", body: JSON.stringify(body ?? {}) }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The invoice action failed.");
    }
  }

  if (!invoice) return <p>{error || "Loading…"}</p>;
  return (
    <div>
      <h1 className="page-title">{invoice.invoiceNumber}</h1>
      <p className="lede">{invoice.customerName} · {invoice.invoiceDate} · due {invoice.dueDate} · {invoice.status}</p>
      {error ? <div className="banner error">{error}</div> : null}
      <div className="card">
        <table>
          <thead><tr><th>Description</th><th>Qty</th><th>Price</th><th>Tax</th><th>Total</th></tr></thead>
          <tbody>{invoice.lines.map((line) => <tr key={line.id}><td>{line.description}</td><td>{line.quantity}</td><td>{line.unitPrice}</td><td>{line.taxAmount}</td><td>{line.lineTotal}</td></tr>)}</tbody>
        </table>
        <p>Tax {invoice.taxTotal} · Total {invoice.total}</p>
      </div>
      <div className="row">
        {invoice.status === "draft" || invoice.status === "rejected" ? <button className="btn" type="button" onClick={() => act("submit")}>Submit</button> : null}
        {invoice.status === "submitted" ? <button className="btn" type="button" onClick={() => act("approve")}>Approve</button> : null}
        {invoice.status === "approved" ? <button className="btn" type="button" onClick={() => act("post", {})}>Post</button> : null}
        {invoice.status === "posted" ? (
          <>
            <input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Reason" />
            <button className="btn" type="button" onClick={() => act("reverse", { reason })}>Reverse</button>
          </>
        ) : null}
      </div>
    </div>
  );
}
