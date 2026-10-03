"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api/client";

type Payment = { id: string; paymentNumber: string; supplierName: string; paymentDate: string; status: string; amount: string; unallocatedAmount: string; apTreatment: string };

export default function PaymentListScreen() {
  const [rows, setRows] = useState<Payment[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    api<{ data: Payment[] }>("/api/v1/supplier-payments?pageSize=100").then((result) => setRows(result.data)).catch((caught: Error) => setError(caught.message));
  }, []);
  return (
    <div>
      <h1 className="page-title">Supplier payments</h1>
      <p className="lede">A fully applied payment debits accounts payable. An unapplied amount needs a supplier advance asset account and is excluded from bill aging.</p>
      {error ? <div className="banner error">{error}</div> : null}
      <p><Link className="btn" href="/supplier-payments/new">New payment</Link></p>
      <div className="card">
        <table>
          <thead><tr><th>Number</th><th>Supplier</th><th>Date</th><th>Status</th><th>Treatment</th><th>Amount</th><th>Unapplied</th></tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}><td><Link href={`/supplier-payments/${row.id}`}>{row.paymentNumber}</Link></td><td>{row.supplierName}</td><td>{row.paymentDate}</td><td>{row.status}</td><td>{row.apTreatment}</td><td>{row.amount}</td><td>{row.unallocatedAmount}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
