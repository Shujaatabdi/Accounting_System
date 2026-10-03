"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api/client";

type Allocation = { id: string; billNumber: string; amount: string; status: string };
type Payment = {
  id: string;
  paymentNumber: string;
  supplierId: string;
  supplierName: string;
  status: string;
  amount: string;
  unallocatedAmount: string;
  apTreatment: string;
  allocations: Allocation[];
};
type Bill = { id: string; billNumber: string; status: string };

export default function PaymentDetailScreen({ id }: { id: string }) {
  const [payment, setPayment] = useState<Payment | null>(null);
  const [bills, setBills] = useState<Bill[]>([]);
  const [billId, setBillId] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const current = await api<Payment>(`/api/v1/supplier-payments/${id}`);
    setPayment(current);
    const open = await api<{ data: Bill[] }>(`/api/v1/bills?supplierId=${current.supplierId}&status=posted&pageSize=100`);
    const posted = open.data.filter((row) => row.status === "posted");
    setBills(posted);
    if (posted[0]) setBillId(posted[0].id);
  }
  useEffect(() => { load().catch((caught: Error) => setError(caught.message)); }, [id]);

  async function act(path: string, body?: unknown) {
    setError("");
    try {
      setPayment(await api<Payment>(`/api/v1/supplier-payments/${id}/${path}`, { method: "POST", body: JSON.stringify(body ?? {}) }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The payment action failed.");
    }
  }

  if (!payment) return <p>{error || "Loading…"}</p>;
  return (
    <div>
      <h1 className="page-title">{payment.paymentNumber}</h1>
      <p className="lede">{payment.supplierName} · {payment.status} · {payment.apTreatment} · unapplied {payment.unallocatedAmount}</p>
      {error ? <div className="banner error">{error}</div> : null}
      <div className="card">
        <p>Amount {payment.amount}</p>
        <table>
          <thead><tr><th>Bill</th><th>Amount</th><th>Status</th><th></th></tr></thead>
          <tbody>{payment.allocations.map((row) => (
            <tr key={row.id}>
              <td>{row.billNumber}</td><td>{row.amount}</td><td>{row.status}</td>
              <td>{row.status === "posted" ? <button className="btn quiet" type="button" onClick={() => act(`allocations/${row.id}/unallocate`)}>Unallocate</button> : null}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <div className="row">
        {payment.status === "draft" || payment.status === "rejected" ? <button className="btn" type="button" onClick={() => act("submit")}>Submit</button> : null}
        {payment.status === "submitted" ? <button className="btn" type="button" onClick={() => act("approve")}>Approve</button> : null}
        {payment.status === "approved" ? <button className="btn" type="button" onClick={() => act("post")}>Post</button> : null}
        {payment.status === "posted" ? (
          <>
            <input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Reversal reason" />
            <button className="btn" type="button" onClick={() => act("reverse", { reason })}>Reverse</button>
          </>
        ) : null}
      </div>
      {payment.status === "posted" && payment.apTreatment === "supplier_advance" ? (
        <form className="card row" onSubmit={(event) => { event.preventDefault(); void act("allocations", { billId, amount }); }}>
          <select value={billId} onChange={(event) => setBillId(event.target.value)}>
            {bills.map((row) => <option key={row.id} value={row.id}>{row.billNumber}</option>)}
          </select>
          <input value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="Amount" required />
          <button className="btn" type="submit">Apply advance to bill</button>
        </form>
      ) : null}
    </div>
  );
}
