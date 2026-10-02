"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api/client";
import { money, todayIso } from "@/lib/formatting";

type Account = { id: string; code: string; name: string };
type Line = { accountId: string; debit: string; credit: string; description: string };

export function JournalForm({ journalId }: { journalId?: string }) {
  const router = useRouter();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [entryDate, setEntryDate] = useState(todayIso());
  const [description, setDescription] = useState("");
  const [reference, setReference] = useState("");
  const [sourceType, setSourceType] = useState<"manual" | "opening_balance">("manual");
  const [lines, setLines] = useState<Line[]>([blank(), blank()]);
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ data: Account[] }>("/api/v1/accounts?postable=true&pageSize=100")
      .then((result) => setAccounts(result.data))
      .catch((caught: Error) => setError(caught.message));
    if (!journalId) return;
    api<{ entryDate: string; description: string; reference: string | null; sourceType: "manual" | "opening_balance"; lines: Line[] }>(`/api/v1/journals/${journalId}`)
      .then((journal) => {
        setEntryDate(journal.entryDate);
        setDescription(journal.description);
        setReference(journal.reference ?? "");
        if (journal.sourceType === "manual" || journal.sourceType === "opening_balance") setSourceType(journal.sourceType);
        setLines(journal.lines.map((line) => ({ accountId: line.accountId, debit: line.debit, credit: line.credit, description: line.description ?? "" })));
      })
      .catch((caught: Error) => setError(caught.message));
  }, [journalId]);

  const debit = sumAmounts(lines.map((line) => line.debit));
  const credit = sumAmounts(lines.map((line) => line.credit));

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    const payload = {
      entryDate,
      description,
      reference: reference || null,
      sourceType,
      lines: lines.filter((line) => line.accountId).map((line) => ({
        accountId: line.accountId,
        description: line.description || null,
        debit: line.debit || "0",
        credit: line.credit || "0",
      })),
    };
    try {
      const saved = await api<{ id: string }>(journalId ? `/api/v1/journals/${journalId}` : "/api/v1/journals", {
        method: journalId ? "PUT" : "POST",
        body: JSON.stringify(payload),
      });
      router.push(`/journals/${saved.id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save the journal.");
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <h1 className="page-title">{journalId ? "Edit draft" : "New journal"}</h1>
      <p className="lede">Amounts are decimal text. A draft may be unfinished. Submit, approval, and posting require equal debits and credits.</p>
      {error ? <div className="banner error">{error}</div> : null}
      <div className="card grid">
        <label className="field"><span>Transaction date</span><input type="date" value={entryDate} onChange={(event) => setEntryDate(event.target.value)} required /></label>
        <label className="field"><span>Source</span>
          <select value={sourceType} onChange={(event) => setSourceType(event.target.value as "manual" | "opening_balance")}>
            <option value="manual">Manual</option>
            <option value="opening_balance">Opening balance</option>
          </select>
        </label>
        <label className="field full"><span>Description</span><input value={description} onChange={(event) => setDescription(event.target.value)} required /></label>
        <label className="field"><span>Reference</span><input value={reference} onChange={(event) => setReference(event.target.value)} /></label>
      </div>
      <div className="card">
        <table>
          <thead><tr><th>Account</th><th>Description</th><th className="num">Debit</th><th className="num">Credit</th></tr></thead>
          <tbody>
            {lines.map((line, index) => (
              <tr key={index}>
                <td>
                  <select value={line.accountId} onChange={(event) => update(index, { accountId: event.target.value })}>
                    <option value="">Select</option>
                    {accounts.map((account) => <option key={account.id} value={account.id}>{account.code} {account.name}</option>)}
                  </select>
                </td>
                <td><input value={line.description} onChange={(event) => update(index, { description: event.target.value })} /></td>
                <td><input className="num" value={line.debit} onChange={(event) => update(index, { debit: event.target.value })} /></td>
                <td><input className="num" value={line.credit} onChange={(event) => update(index, { credit: event.target.value })} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn quiet" type="button" onClick={() => setLines([...lines, blank()])}>Add line</button>
          <strong className={debit === credit ? "" : "banner error"}>Debit {money(formatScaled(debit), 2)} · Credit {money(formatScaled(credit), 2)}</strong>
        </div>
      </div>
      <button className="btn" type="submit">Save draft</button>
    </form>
  );

  function update(index: number, patch: Partial<Line>) {
    setLines(lines.map((line, item) => item === index ? { ...line, ...patch } : line));
  }
}

function blank(): Line {
  return { accountId: "", debit: "", credit: "", description: "" };
}

function sumAmounts(values: string[]) {
  return values.reduce((sum, value) => sum + scaled(value), 0n);
}

function scaled(value: string) {
  if (!/^\d+(\.\d+)?$/.test(value)) return 0n;
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 10000n + BigInt((fraction + "0000").slice(0, 4));
}

function formatScaled(value: bigint) {
  const whole = value / 10000n;
  const fraction = (value % 10000n).toString().padStart(4, "0").slice(0, 2);
  return `${whole.toString()}.${fraction}`;
}
