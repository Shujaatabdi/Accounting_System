"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { money } from "@/lib/format";

type Journal = { id: string; entryNumber: string; entryDate: string; postingDate: string | null; status: string; description: string; totalDebit: string; reversedByEntryId: string | null };

export default function JournalsPage() {
  const [rows, setRows] = useState<Journal[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    api<{ data: Journal[] }>("/api/v1/journals?pageSize=50").then((result) => setRows(result.data)).catch((caught: Error) => setError(caught.message));
  }, []);
  return (
    <div>
      <div className="row">
        <h1 className="page-title">Journals</h1>
        <Link className="btn" href="/journals/new">New journal</Link>
      </div>
      <p className="lede">The list shows the transaction date. Reports use the posting date, which is set when the journal is posted.</p>
      {error ? <div className="banner error">{error}</div> : null}
      <div className="card">
        <table>
          <thead><tr><th>Number</th><th>Transaction date</th><th>Posting date</th><th>Description</th><th>Status</th><th className="num">Debit</th></tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td><Link href={`/journals/${row.id}`}>{row.entryNumber}</Link></td>
                <td>{row.entryDate}</td>
                <td>{row.postingDate ?? "—"}</td>
                <td>{row.description}</td>
                <td><span className={`badge ${row.status}`}>{row.status}{row.reversedByEntryId ? " · reversed" : ""}</span></td>
                <td className="num">{money(row.totalDebit, 2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
