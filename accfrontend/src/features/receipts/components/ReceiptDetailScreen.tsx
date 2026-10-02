"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api/client";

type Allocation = { id: string; invoiceNumber: string; amount: string; status: string };
type Receipt = {
  id: string;
  receiptNumber: string;
  customerId: string;
  customerName: string;
  status: string;
  amount: string;
  unallocatedAmount: string;
  unappliedTreatment: string;
  allocations: Allocation[];
};
type Invoice = { id: string; invoiceNumber: string; status: string };

export default function ReceiptDetailScreen({ id }: { id: string }) {
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [invoiceId, setInvoiceId] = useState("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const current = await api<Receipt>(`/api/v1/receipts/${id}`);
    setReceipt(current);
    const open = await api<{ data: Invoice[] }>(`/api/v1/invoices?customerId=${current.customerId}&status=posted&pageSize=100`);
    setInvoices(open.data.filter((row) => row.status === "posted"));
    if (open.data[0]) setInvoiceId(open.data[0].id);
  }
  useEffect(() => { load().catch((caught: Error) => setError(caught.message)); }, [id]);

  async function act(path: string, body?: unknown) {
    setError("");
    try {
      setReceipt(await api<Receipt>(`/api/v1/receipts/${id}/${path}`, { method: "POST", body: JSON.stringify(body ?? {}) }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The receipt action failed.");
    }
  }

  if (!receipt) return <p>{error || "Loading…"}</p>;
  return (
    <div>
      <h1 className="page-title">{receipt.receiptNumber}</h1>
      <p className="lede">{receipt.customerName} · {receipt.status} · {receipt.unappliedTreatment} · unallocated {receipt.unallocatedAmount}</p>
      {error ? <div className="banner error">{error}</div> : null}
      <div className="card">
        <p>Amount {receipt.amount}</p>
        <table>
          <tbody>{receipt.allocations.map((row) => <tr key={row.id}><td>{row.invoiceNumber}</td><td>{row.amount}</td><td>{row.status}</td>{row.status === "posted" ? <td><button className="btn quiet" type="button" onClick={() => act(`allocations/${row.id}/unallocate`)}>Unallocate</button></td> : <td />}</tr>)}</tbody>
        </table>
      </div>
      <div className="row">
        {receipt.status === "draft" || receipt.status === "rejected" ? <button className="btn" type="button" onClick={() => act("submit")}>Submit</button> : null}
        {receipt.status === "submitted" ? <button className="btn" type="button" onClick={() => act("approve")}>Approve</button> : null}
        {receipt.status === "approved" ? <button className="btn" type="button" onClick={() => act("post")}>Post</button> : null}
      </div>
      {receipt.status === "posted" ? (
        <form className="card row" onSubmit={(event) => { event.preventDefault(); void act("allocations", { invoiceId, amount }); }}>
          <select value={invoiceId} onChange={(event) => setInvoiceId(event.target.value)}>
            {invoices.map((row) => <option key={row.id} value={row.id}>{row.invoiceNumber}</option>)}
          </select>
          <input value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="Amount" required />
          <button className="btn" type="submit">Allocate</button>
        </form>
      ) : null}
    </div>
  );
}
