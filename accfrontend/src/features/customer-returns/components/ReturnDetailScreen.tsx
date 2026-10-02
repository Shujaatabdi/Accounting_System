"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api/client";

type ReturnDoc = {
  id: string;
  returnNumber: string;
  status: string;
  reason: string;
  total: string;
  lines: Array<{ id: string; description: string; quantity: string; lineTotal: string; disposition: string }>;
};

export default function ReturnDetailScreen({ id }: { id: string }) {
  const [doc, setDoc] = useState<ReturnDoc | null>(null);
  const [error, setError] = useState("");
  const [reason, setReason] = useState("");

  useEffect(() => {
    api<ReturnDoc>(`/api/v1/customer-returns/${id}`).then(setDoc).catch((caught: Error) => setError(caught.message));
  }, [id]);

  async function act(path: string, body?: unknown) {
    setError("");
    try {
      setDoc(await api<ReturnDoc>(`/api/v1/customer-returns/${id}/${path}`, { method: "POST", body: JSON.stringify(body ?? {}) }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The return action failed.");
    }
  }

  if (!doc) return <p>{error || "Loading…"}</p>;
  return (
    <div>
      <h1 className="page-title">{doc.returnNumber}</h1>
      <p className="lede">{doc.status} · {doc.reason}</p>
      {error ? <div className="banner error">{error}</div> : null}
      <div className="card">
        <table>
          <tbody>{doc.lines.map((line) => <tr key={line.id}><td>{line.description}</td><td>{line.quantity}</td><td>{line.lineTotal}</td><td>{line.disposition}</td></tr>)}</tbody>
        </table>
        <p>Total {doc.total}</p>
      </div>
      <div className="row">
        {doc.status === "draft" || doc.status === "rejected" ? <button className="btn" type="button" onClick={() => act("submit")}>Submit</button> : null}
        {doc.status === "submitted" ? <button className="btn" type="button" onClick={() => act("approve")}>Approve</button> : null}
        {doc.status === "approved" ? <button className="btn" type="button" onClick={() => act("post")}>Post</button> : null}
        {doc.status === "posted" ? (
          <>
            <input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Reason" />
            <button className="btn" type="button" onClick={() => act("reverse", { reason })}>Reverse</button>
          </>
        ) : null}
      </div>
    </div>
  );
}
