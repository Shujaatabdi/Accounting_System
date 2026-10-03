"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api/client";

type Line = { id: string; description: string; quantity: string; unitPrice: string; taxAmount: string; lineTotal: string; disposition: string };
type Row = {
  id: string;
  returnNumber: string;
  supplierName: string;
  status: string;
  returnDate: string;
  reason: string;
  unreferenced: boolean;
  total: string;
  taxTotal: string;
  lines: Line[];
};

export default function ReturnDetailScreen({ id }: { id: string }) {
  const [row, setRow] = useState<Row | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    api<Row>(`/api/v1/supplier-returns/${id}`).then(setRow).catch((caught: Error) => setError(caught.message));
  }, [id]);

  async function act(path: string, body?: unknown) {
    setError("");
    try {
      setRow(await api<Row>(`/api/v1/supplier-returns/${id}/${path}`, { method: "POST", body: JSON.stringify(body ?? {}) }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The return action failed.");
    }
  }

  if (!row) return <p>{error || "Loading…"}</p>;
  const editable = row.status === "draft" || row.status === "rejected";
  return (
    <div>
      <h1 className="page-title">{row.returnNumber}</h1>
      <p className="lede">{row.supplierName} · {row.returnDate} · {row.status} · {row.unreferenced ? "Unreferenced" : "Linked to a bill"} · {row.reason}</p>
      {error ? <div className="banner error">{error}</div> : null}
      <div className="card">
        <table>
          <thead><tr><th>Description</th><th>Qty</th><th>Price</th><th>Tax</th><th>Total</th><th>Disposition</th></tr></thead>
          <tbody>
            {row.lines.map((line) => (
              <tr key={line.id}><td>{line.description}</td><td>{line.quantity}</td><td>{line.unitPrice}</td><td>{line.taxAmount}</td><td>{line.lineTotal}</td><td>{line.disposition}</td></tr>
            ))}
          </tbody>
        </table>
        <p>Tax {row.taxTotal} · Total {row.total}. Disposition does not post stock.</p>
      </div>
      <div className="row">
        {editable ? <button className="btn" type="button" onClick={() => act("submit")}>Submit</button> : null}
        {row.status === "submitted" ? <button className="btn" type="button" onClick={() => act("approve")}>Approve</button> : null}
        {row.status === "approved" ? <button className="btn" type="button" onClick={() => act("post")}>Post</button> : null}
        {row.status === "posted" ? (
          <>
            <input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Reason" />
            <button className="btn" type="button" onClick={() => act("reverse", { reason })}>Reverse</button>
          </>
        ) : null}
      </div>
    </div>
  );
}
