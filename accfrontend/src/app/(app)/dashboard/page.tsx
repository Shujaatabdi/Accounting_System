"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { money } from "@/lib/format";

type Dashboard = {
  company: {
    displayName: string;
    currencySymbol: string;
    currencyDecimalPlaces: number;
    profilePlaceholder: boolean;
    timezone: string;
  };
  unpostedJournals?: number;
  openPeriods?: number;
  trialBalance?: { asOf: string; totalDebit: string; totalCredit: string; balances: boolean };
};

export default function DashboardPage() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api<Dashboard>("/api/v1/dashboard").then(setData).catch((caught: Error) => setError(caught.message));
  }, []);
  if (error) return <div className="banner error">{error}</div>;
  if (!data) return <p>Loading dashboard…</p>;
  const places = data.company.currencyDecimalPlaces;
  return (
    <div>
      <h1 className="page-title">{data.company.displayName}</h1>
      <p className="lede">Official reports use posting dates. Drafts and approvals stay out of the ledger until a journal is posted. Time zone: {data.company.timezone}.</p>
      {data.company.profilePlaceholder ? <div className="banner warn">The company profile still has placeholder country or name values. Set them before going live. Country tax rules are not verified.</div> : null}
      <div className="grid">
        <div className="card"><strong>Open periods</strong><p>{data.openPeriods ?? "Hidden"}</p></div>
        <div className="card"><strong>Unposted journals</strong><p>{data.unpostedJournals ?? "Hidden"}</p></div>
        <div className="card">
          <strong>Trial balance {data.trialBalance ? `as of ${data.trialBalance.asOf}` : ""}</strong>
          {data.trialBalance ? (
            <p>{data.company.currencySymbol} {money(data.trialBalance.totalDebit, places)} debits = {money(data.trialBalance.totalCredit, places)} credits. {data.trialBalance.balances ? "In balance." : "Out of balance."}</p>
          ) : <p>Report permission is required.</p>}
        </div>
      </div>
    </div>
  );
}
