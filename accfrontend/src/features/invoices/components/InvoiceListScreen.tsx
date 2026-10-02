"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api/client";

type Invoice = { id: string; invoiceNumber: string; customerName: string; invoiceDate: string; dueDate: string; status: string; total: string };

export default function InvoiceListScreen() {
  const [rows, setRows] = useState<Invoice[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    api<{ data: Invoice[] }>("/api/v1/invoices?pageSize=100").then((result) => setRows(result.data)).catch((caught: Error) => setError(caught.message));
  }, []);
  return (
    <div>
      <h1 className="page-title">Invoices</h1>
      <p className="lede">Posted invoices are reversed, not edited. A reversal waits until receipts are unallocated and returns are reversed.</p>
      {error ? <div className="banner error">{error}</div> : null}
      <p><Link className="btn" href="/invoices/new">New invoice</Link></p>
      <div className="card">
        <table>
          <thead><tr><th>Number</th><th>Customer</th><th>Date</th><th>Due</th><th>Status</th><th>Total</th></tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}><td><Link href={`/invoices/${row.id}`}>{row.invoiceNumber}</Link></td><td>{row.customerName}</td><td>{row.invoiceDate}</td><td>{row.dueDate}</td><td>{row.status}</td><td>{row.total}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
