"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api/client";

type Bill = { id: string; billNumber: string; supplierName: string; billDate: string; dueDate: string; status: string; total: string };

export default function BillListScreen() {
  const [rows, setRows] = useState<Bill[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    api<{ data: Bill[] }>("/api/v1/bills?pageSize=100").then((result) => setRows(result.data)).catch((caught: Error) => setError(caught.message));
  }, []);
  return (
    <div>
      <h1 className="page-title">Supplier bills</h1>
      <p className="lede">Posted bills are reversed, not edited. A bill posts to the product purchase expense account and the purchase tax asset. It does not post inventory.</p>
      {error ? <div className="banner error">{error}</div> : null}
      <p><Link className="btn" href="/bills/new">New bill</Link></p>
      <div className="card">
        <table>
          <thead><tr><th>Number</th><th>Supplier</th><th>Date</th><th>Due</th><th>Status</th><th>Total</th></tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}><td><Link href={`/bills/${row.id}`}>{row.billNumber}</Link></td><td>{row.supplierName}</td><td>{row.billDate}</td><td>{row.dueDate}</td><td>{row.status}</td><td>{row.total}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
