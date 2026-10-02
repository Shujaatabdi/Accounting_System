"use client";

import { FormEvent, useEffect, useState } from "react";
import { api } from "@/lib/api/client";

type Sequence = { docType: string; prefix: string; nextNumber: number; padLength: number };

export default function NumberingPage() {
  const [rows, setRows] = useState<Sequence[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => { api<{ data: Sequence[] }>("/api/v1/numbering").then((result) => setRows(result.data)).catch((caught: Error) => setError(caught.message)); }, []);
  async function save(event: FormEvent, row: Sequence) {
    event.preventDefault();
    try {
      await api(`/api/v1/numbering/${row.docType}`, { method: "PUT", body: JSON.stringify(row) });
      setMessage("Numbering saved. Issued numbers are not rewritten.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not save numbering."); }
  }
  return (
    <div>
      <h1 className="page-title">Document numbering</h1>
      {error ? <div className="banner error">{error}</div> : null}
      {message ? <div className="banner ok">{message}</div> : null}
      {rows.map((row, index) => (
        <form className="card row" key={row.docType} onSubmit={(event) => save(event, row)}>
          <strong>{row.docType}</strong>
          <input value={row.prefix} onChange={(event) => update(index, { prefix: event.target.value })} />
          <input type="number" value={row.nextNumber} onChange={(event) => update(index, { nextNumber: Number(event.target.value) })} />
          <input type="number" value={row.padLength} onChange={(event) => update(index, { padLength: Number(event.target.value) })} />
          <button className="btn" type="submit">Save</button>
        </form>
      ))}
    </div>
  );
  function update(index: number, patch: Partial<Sequence>) {
    setRows(rows.map((row, item) => item === index ? { ...row, ...patch } : row));
  }
}
