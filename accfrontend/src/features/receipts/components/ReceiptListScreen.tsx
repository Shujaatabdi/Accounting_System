"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api/client";

type Receipt = { id: string; receiptNumber: string; customerName: string; receiptDate: string; status: string; amount: string; unallocatedAmount: string };

export default function ReceiptListScreen() {
  const [rows, setRows] = useState<Receipt[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    api<{ data: Receipt[] }>("/api/v1/receipts?pageSize=100").then((result) => setRows(result.data)).catch((caught: Error) => setError(caught.message));
  }, []);
  return (
    <div>
      <h1 className="page-title">Receipts</h1>
      <p className="lede">Unapplied cash uses the customer advance account unless sales settings credit receivables instead. Advances do not appear in invoice aging.</p>
      {error ? <div className="banner error">{error}</div> : null}
      <p><Link className="btn" href="/receipts/new">New receipt</Link></p>
      <div className="card">
        <table>
          <thead><tr><th>Number</th><th>Customer</th><th>Date</th><th>Status</th><th>Amount</th><th>Unallocated</th></tr></thead>
          <tbody>
            {rows.map((row) => <tr key={row.id}><td><Link href={`/receipts/${row.id}`}>{row.receiptNumber}</Link></td><td>{row.customerName}</td><td>{row.receiptDate}</td><td>{row.status}</td><td>{row.amount}</td><td>{row.unallocatedAmount}</td></tr>)}
          </tbody>
        </table>
      </div>
    </div>
  );
}
