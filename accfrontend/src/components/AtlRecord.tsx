"use client";

import { FormEvent, useEffect, useState } from "react";

export type AtlRecord = {
  status: "active" | "inactive";
  checkedAt: string | null;
  reference: string | null;
  recordedByName: string | null;
  recordedAt: string | null;
  manuallyEntered: boolean;
  verifiedByApplication: boolean;
} | null;

export type AtlSnapshot = {
  recorded: boolean;
  status: "active" | "inactive" | null;
  checkedAt: string | null;
  reference: string | null;
} | null;

function toLocalInput(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatWhen(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

const statusLabel: Record<string, string> = { active: "Active", inactive: "Inactive" };

export function AtlRecordPanel({
  record,
  canRecord,
  onSave,
}: {
  record: AtlRecord;
  canRecord: boolean;
  onSave: (body: { status: "active" | "inactive" | null; checkedAt?: string; reference?: string }) => Promise<void>;
}) {
  const [status, setStatus] = useState<"active" | "inactive">(record?.status ?? "active");
  const [checkedAt, setCheckedAt] = useState(toLocalInput(record?.checkedAt ?? null));
  const [reference, setReference] = useState(record?.reference ?? "");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setStatus(record?.status ?? "active");
    setCheckedAt(toLocalInput(record?.checkedAt ?? null));
    setReference(record?.reference ?? "");
  }, [record]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await onSave({ status, checkedAt: new Date(checkedAt).toISOString(), reference });
    } finally {
      setBusy(false);
    }
  }

  async function clear() {
    setBusy(true);
    try {
      await onSave({ status: null });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <h2>Manual ATL</h2>
      <p>This status was entered manually and has not been verified by the application. It does not change tax, withholding, or whether a document can be posted.</p>
      {record ? (
        <p>Recorded status: {statusLabel[record.status]}. Checked {formatWhen(record.checkedAt)}. Reference {record.reference}. {record.recordedByName ? `Entered by ${record.recordedByName}` : "Entered by a user"}{record.recordedAt ? ` on ${formatWhen(record.recordedAt)}` : ""}.</p>
      ) : (
        <p>Not recorded.</p>
      )}
      {canRecord ? (
        <form className="grid" onSubmit={submit}>
          <label className="field"><span>ATL status</span>
            <select value={status} onChange={(event) => setStatus(event.target.value as "active" | "inactive")}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </label>
          <label className="field"><span>Checked at</span>
            <input type="datetime-local" value={checkedAt} onChange={(event) => setCheckedAt(event.target.value)} required />
          </label>
          <label className="field"><span>Reference</span>
            <input value={reference} onChange={(event) => setReference(event.target.value)} maxLength={160} required />
          </label>
          <div className="row">
            <button className="btn" type="submit" disabled={busy}>Save ATL</button>
            {record ? <button className="btn" type="button" disabled={busy} onClick={() => void clear()}>Clear ATL</button> : null}
          </div>
        </form>
      ) : (
        <p>You can view this record. Saving it needs the ATL permission.</p>
      )}
    </div>
  );
}

export function AtlSnapshotCard({ title, snapshot }: { title: string; snapshot: AtlSnapshot }) {
  if (!snapshot) return null;
  return (
    <div className="card">
      <h2>{title}</h2>
      <p>This is the ATL record copied when the document was posted. Later changes to the customer or supplier do not change this copy. It does not affect tax or the journal. The status was entered manually and has not been verified by the application.</p>
      {snapshot.recorded && snapshot.status ? (
        <p>Status {statusLabel[snapshot.status]}. Checked {formatWhen(snapshot.checkedAt)}. Reference {snapshot.reference}.</p>
      ) : (
        <p>Not recorded.</p>
      )}
    </div>
  );
}
