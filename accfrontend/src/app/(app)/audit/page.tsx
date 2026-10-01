"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

type Entry = { id: string; occurredAt: string; action: string; entityType: string; entityId: string | null; summary: string | null; before: unknown; after: unknown };

export default function AuditPage() {
  const [rows, setRows] = useState<Entry[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    api<{ data: Entry[] }>("/api/v1/audit?pageSize=50").then((result) => setRows(result.data)).catch((caught: Error) => setError(caught.message));
  }, []);
  return (
    <div>
      <h1 className="page-title">Audit log</h1>
      <p className="lede">Sign-in, settings, approvals, posting, reversals, and period changes are recorded with the actor and before/after values.</p>
      {error ? <div className="banner error">{error}</div> : null}
      <div className="card">
        {rows.map((row) => (
          <details key={row.id} style={{ padding: "8px 0", borderBottom: "1px solid #e6ebf0" }}>
            <summary>{row.occurredAt} · {row.action} · {row.summary}</summary>
            <pre>{JSON.stringify({ before: row.before, after: row.after }, null, 2)}</pre>
          </details>
        ))}
      </div>
    </div>
  );
}
