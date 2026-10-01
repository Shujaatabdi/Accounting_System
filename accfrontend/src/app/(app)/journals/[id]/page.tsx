"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { can, money } from "@/lib/format";
import { useAuth } from "@/lib/auth";

type Journal = {
  id: string;
  entryNumber: string;
  entryDate: string;
  postingDate: string | null;
  status: string;
  description: string;
  reference: string | null;
  sourceType: string;
  reversesEntryId: string | null;
  reversedByEntryId: string | null;
  totalDebit: string;
  totalCredit: string;
  lines: Array<{ id: string; accountCode: string; accountName: string; description: string | null; debit: string; credit: string }>;
};

export default function JournalDetailPage() {
  const params = useParams<{ id: string }>();
  const auth = useAuth();
  const [journal, setJournal] = useState<Journal | null>(null);
  const [error, setError] = useState("");
  const [reason, setReason] = useState("");
  const [postingDate, setPostingDate] = useState("");

  async function load() {
    const result = await api<Journal>(`/api/v1/journals/${params.id}`);
    setJournal(result);
    setPostingDate(result.postingDate ?? result.entryDate);
  }
  useEffect(() => { load().catch((caught: Error) => setError(caught.message)); }, [params.id]);

  async function act(path: string, body?: unknown) {
    setError("");
    try {
      await api(path, { method: "POST", body: body ? JSON.stringify(body) : "{}" });
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The action failed.");
    }
  }

  if (!journal) return error ? <div className="banner error">{error}</div> : <p>Loading journal…</p>;
  const user = auth.user;
  return (
    <div>
      <h1 className="page-title">{journal.entryNumber}</h1>
      <p className="lede">{journal.description}. Transaction date {journal.entryDate}. Posting date {journal.postingDate ?? "not posted"}. Source {journal.sourceType}.</p>
      {error ? <div className="banner error">{error}</div> : null}
      {journal.reversedByEntryId ? <div className="banner warn">Reversed by <Link href={`/journals/${journal.reversedByEntryId}`}>the reversing entry</Link>.</div> : null}
      <div className="card">
        <table>
          <thead><tr><th>Account</th><th>Description</th><th className="num">Debit</th><th className="num">Credit</th></tr></thead>
          <tbody>
            {journal.lines.map((line) => (
              <tr key={line.id}>
                <td>{line.accountCode} {line.accountName}</td>
                <td>{line.description}</td>
                <td className="num">{money(line.debit, 2)}</td>
                <td className="num">{money(line.credit, 2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p>Debits {money(journal.totalDebit, 2)} · Credits {money(journal.totalCredit, 2)}</p>
      </div>
      <div className="card no-print row">
        <span className={`badge ${journal.status}`}>{journal.status}</span>
        {journal.status === "draft" ? <Link className="btn quiet" href={`/journals/${journal.id}/edit`}>Edit</Link> : null}
        {journal.status === "draft" && can(user, "journals.submit") ? <button className="btn" type="button" onClick={() => act(`/api/v1/journals/${journal.id}/submit`)}>Submit</button> : null}
        {journal.status === "pending_approval" && can(user, "journals.approve") ? <button className="btn" type="button" onClick={() => act(`/api/v1/journals/${journal.id}/approve`)}>Approve</button> : null}
        {journal.status === "pending_approval" && can(user, "journals.approve") ? <button className="btn quiet" type="button" onClick={() => act(`/api/v1/journals/${journal.id}/reject`, { reason: reason || "Returned to draft" })}>Reject</button> : null}
        {journal.status === "approved" && can(user, "journals.post") ? (
          <>
            <input type="date" value={postingDate} onChange={(event) => setPostingDate(event.target.value)} />
            <button className="btn" type="button" onClick={() => act(`/api/v1/journals/${journal.id}/post`, { postingDate })}>Post</button>
          </>
        ) : null}
        {journal.status === "posted" && !journal.reversedByEntryId && can(user, "journals.reverse") ? (
          <button className="btn danger" type="button" onClick={() => act(`/api/v1/journals/${journal.id}/reverse`, { postingDate, reason })}>Reverse</button>
        ) : null}
        {["draft", "pending_approval", "approved"].includes(journal.status) && can(user, "journals.void") ? (
          <button className="btn quiet" type="button" onClick={() => act(`/api/v1/journals/${journal.id}/void`, { reason: reason || "Voided before posting" })}>Void</button>
        ) : null}
        <input placeholder="Reason" value={reason} onChange={(event) => setReason(event.target.value)} />
      </div>
    </div>
  );
}
