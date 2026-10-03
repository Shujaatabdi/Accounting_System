"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api/client";

type Row = { id: string; returnNumber: string; supplierName: string; returnDate: string; status: string; total: string; unreferenced: boolean };

export default function ReturnListScreen() {
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    api<{ data: Row[] }>("/api/v1/supplier-returns?pageSize=100").then((result) => setRows(result.data)).catch((caught: Error) => setError(caught.message));
  }, []);
  return (
    <div>
      <h1 className="page-title">Supplier returns</h1>
      <p className="lede">A linked return uses the source bill line price, tax, discount, and accounts. It does not move warehouse quantity. Posted returns are reversed, not edited.</p>
      {error ? <div className="banner error">{error}</div> : null}
      <p><Link className="btn" href="/supplier-returns/new">New return</Link></p>
      <div className="card">
        <table>
          <thead><tr><th>Number</th><th>Supplier</th><th>Date</th><th>Status</th><th>Source</th><th>Total</th></tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}><td><Link href={`/supplier-returns/${row.id}`}>{row.returnNumber}</Link></td><td>{row.supplierName}</td><td>{row.returnDate}</td><td>{row.status}</td><td>{row.unreferenced ? "Unreferenced" : "Bill"}</td><td>{row.total}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
