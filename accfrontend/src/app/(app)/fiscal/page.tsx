"use client";

import { FormEvent, useEffect, useState } from "react";
import { api } from "@/lib/api";

type Period = { id: string; name: string; startDate: string; endDate: string; status: string };
type Year = { id: string; name: string; startDate: string; endDate: string; status: string; periods: Period[] };

export default function FiscalPage() {
  const [years, setYears] = useState<Year[]>([]);
  const [startDate, setStartDate] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  async function load() { setYears((await api<{ data: Year[] }>("/api/v1/fiscal-years")).data); }
  useEffect(() => { load().catch((caught: Error) => setError(caught.message)); }, []);

  async function createYear(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      await api("/api/v1/fiscal-years", { method: "POST", body: JSON.stringify({ startDate }) });
      setMessage("Fiscal year created.");
      await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not create the year."); }
  }

  async function change(path: string) {
    const reason = window.prompt("Reason for this period change");
    if (!reason || reason.trim().length < 3) return;
    setError("");
    try {
      const result = await api<{ unpostedDocuments?: number }>(path, { method: "POST", body: JSON.stringify({ reason }) });
      setMessage(result.unpostedDocuments ? `Updated. ${result.unpostedDocuments} unposted documents use dates in that period.` : "Updated.");
      await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not update the period."); }
  }

  return (
    <div>
      <h1 className="page-title">Fiscal periods</h1>
      <p className="lede">Posting is allowed only in an open period of an open year. Reopening a year does not reopen its periods. New years start on the first day of the month set on the company profile.</p>
      {error ? <div className="banner error">{error}</div> : null}
      {message ? <div className="banner ok">{message}</div> : null}
      <form className="card row" onSubmit={createYear}>
        <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} required />
        <button className="btn" type="submit">Create year</button>
      </form>
      {years.map((year) => (
        <div className="card" key={year.id}>
          <div className="row">
            <strong>{year.name}</strong> <span className="badge">{year.status}</span>
            <span>{year.startDate} to {year.endDate}</span>
            {year.status === "open" ? <button className="btn quiet" type="button" onClick={() => change(`/api/v1/fiscal-years/${year.id}/close`)}>Close year</button> : <button className="btn quiet" type="button" onClick={() => change(`/api/v1/fiscal-years/${year.id}/reopen`)}>Reopen year</button>}
          </div>
          <table>
            <tbody>
              {year.periods.map((period) => (
                <tr key={period.id}>
                  <td>{period.name}</td><td>{period.startDate}</td><td>{period.endDate}</td><td>{period.status}</td>
                  <td>{period.status === "open"
                    ? <button className="btn quiet" type="button" onClick={() => change(`/api/v1/fiscal-periods/${period.id}/close`)}>Close</button>
                    : <button className="btn quiet" type="button" onClick={() => change(`/api/v1/fiscal-periods/${period.id}/reopen`)}>Reopen</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
