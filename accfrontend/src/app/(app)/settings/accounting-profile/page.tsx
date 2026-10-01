"use client";

import { FormEvent, useEffect, useState } from "react";
import { api } from "@/lib/api";

type Profile = { id: string; countryCode: string; name: string; complianceStatus: "unverified" | "reviewed"; notes: string | null; effectiveFrom: string; isActive: boolean };

export default function AccountingProfilePage() {
  const [current, setCurrent] = useState<Profile | null>(null);
  const [history, setHistory] = useState<Profile[]>([]);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    api<{ current: Profile | null; history: Profile[]; complianceNote: string }>("/api/v1/accounting-profile").then((result) => {
      setCurrent(result.current);
      setHistory(result.history);
      setNote(result.complianceNote);
    }).catch((caught: Error) => setError(caught.message));
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!current) return;
    try {
      const saved = await api<Profile>("/api/v1/accounting-profile", { method: "PUT", body: JSON.stringify(current) });
      setCurrent(saved);
      setMessage("Profile saved. Marking a country reviewed is an administrator acknowledgement, not a certification by this software.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not save the profile."); }
  }

  if (!current) return error ? <div className="banner error">{error}</div> : <p>Loading profile…</p>;
  return (
    <form onSubmit={onSubmit}>
      <h1 className="page-title">Country profile</h1>
      <p className="lede">{note}</p>
      {error ? <div className="banner error">{error}</div> : null}
      {message ? <div className="banner ok">{message}</div> : null}
      <div className="card grid">
        <label className="field"><span>Country code</span><input value={current.countryCode} onChange={(event) => setCurrent({ ...current, countryCode: event.target.value.toUpperCase() })} /></label>
        <label className="field"><span>Name</span><input value={current.name} onChange={(event) => setCurrent({ ...current, name: event.target.value })} /></label>
        <label className="field"><span>Compliance</span>
          <select value={current.complianceStatus} onChange={(event) => setCurrent({ ...current, complianceStatus: event.target.value as Profile["complianceStatus"] })}>
            <option value="unverified">Unverified</option>
            <option value="reviewed">Reviewed by administrator</option>
          </select>
        </label>
        <label className="field full"><span>Notes</span><textarea value={current.notes ?? ""} onChange={(event) => setCurrent({ ...current, notes: event.target.value })} /></label>
      </div>
      <button className="btn" type="submit">Save profile</button>
      <div className="card"><strong>History</strong>{history.map((row) => <p key={row.id}>{row.effectiveFrom} · {row.countryCode} · {row.complianceStatus}</p>)}</div>
    </form>
  );
}
