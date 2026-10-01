"use client";

import { useParams } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { api, downloadCsv } from "@/lib/api";
import { can, money, todayIso } from "@/lib/format";
import { useAuth } from "@/lib/auth";

const TITLES: Record<string, string> = {
  "trial-balance": "Trial balance",
  "profit-and-loss": "Profit and loss",
  "balance-sheet": "Balance sheet",
  "general-ledger": "General ledger",
  journals: "Journal report",
};

export default function ReportPage() {
  const params = useParams<{ slug: string }>();
  const auth = useAuth();
  const slug = params.slug;
  const [asOf, setAsOf] = useState(todayIso());
  const [from, setFrom] = useState(`${todayIso().slice(0, 4)}-01-01`);
  const [to, setTo] = useState(todayIso());
  const [accountId, setAccountId] = useState("");
  const [accounts, setAccounts] = useState<Array<{ id: string; code: string; name: string }>>([]);
  const [report, setReport] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (slug !== "general-ledger") return;
    api<{ data: Array<{ id: string; code: string; name: string }> }>("/api/v1/accounts?postable=true&pageSize=100")
      .then((result) => setAccounts(result.data))
      .catch((caught: Error) => setError(caught.message));
  }, [slug]);

  async function run(event?: FormEvent) {
    event?.preventDefault();
    setError("");
    const query = new URLSearchParams();
    if (slug === "trial-balance" || slug === "balance-sheet") query.set("asOf", asOf);
    else {
      query.set("from", from);
      query.set("to", to);
    }
    if (slug === "general-ledger") query.set("accountId", accountId);
    try {
      setReport(await api(`/api/v1/reports/${slug}?${query.toString()}`));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Report failed.");
    }
  }

  const places = 2;
  return (
    <div>
      <h1 className="page-title">{TITLES[slug] ?? "Report"}</h1>
      <p className="lede">These reports include posted journals only. Dates filter the posting date, not the transaction date. Print this page to save a PDF. Spreadsheet export is CSV.</p>
      <form className="card row no-print" onSubmit={run}>
        {slug === "trial-balance" || slug === "balance-sheet" ? (
          <label className="field"><span>As of</span><input type="date" value={asOf} onChange={(event) => setAsOf(event.target.value)} /></label>
        ) : (
          <>
            <label className="field"><span>From</span><input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
            <label className="field"><span>To</span><input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label>
          </>
        )}
        {slug === "general-ledger" ? (
          <label className="field"><span>Account</span>
            <select value={accountId} onChange={(event) => setAccountId(event.target.value)} required>
              <option value="">Select</option>
              {accounts.map((account) => <option key={account.id} value={account.id}>{account.code} {account.name}</option>)}
            </select>
          </label>
        ) : null}
        <button className="btn" type="submit">Run</button>
        {report && can(auth.user, "reports.export") ? <button className="btn quiet" type="button" onClick={() => downloadCsv(`/api/v1/reports/${slug}?${currentQuery()}&format=csv`, `${slug}.csv`)}>Export CSV</button> : null}
        <button className="btn quiet" type="button" onClick={() => window.print()}>Print / PDF</button>
      </form>
      {error ? <div className="banner error">{error}</div> : null}
      {report ? <ReportBody slug={slug} report={report} places={places} /> : null}
    </div>
  );

  function currentQuery() {
    const query = new URLSearchParams();
    if (slug === "trial-balance" || slug === "balance-sheet") query.set("asOf", asOf);
    else {
      query.set("from", from);
      query.set("to", to);
    }
    if (accountId) query.set("accountId", accountId);
    return query.toString();
  }
}

function ReportBody({ slug, report, places }: { slug: string; report: Record<string, unknown>; places: number }) {
  if (slug === "trial-balance") {
    const rows = report.rows as Array<{ code: string; name: string; debitBalance: string; creditBalance: string }>;
    return (
      <div className="card">
        <p>{report.balances ? "In balance." : "Out of balance."} Debits {money(String(report.totalDebit), places)} · Credits {money(String(report.totalCredit), places)}</p>
        <AmountTable rows={rows.map((row) => [row.code, row.name, money(row.debitBalance, places), money(row.creditBalance, places)])} headers={["Code", "Name", "Debit", "Credit"]} />
      </div>
    );
  }
  if (slug === "profit-and-loss") {
    const rows = report.rows as Array<{ code: string; name: string; accountType: string; amount: string }>;
    return (
      <div className="card">
        <p>Income {money(String(report.totalIncome), places)} · Expenses {money(String(report.totalExpense), places)} · Net {money(String(report.netIncome), places)}</p>
        <AmountTable rows={rows.map((row) => [row.code, row.name, row.accountType, money(row.amount, places)])} headers={["Code", "Name", "Type", "Amount"]} />
      </div>
    );
  }
  if (slug === "balance-sheet") {
    const section = (name: string, rows: Array<{ code: string; name: string; amount: string }>) => (
      <>
        <h2>{name}</h2>
        <AmountTable rows={rows.map((row) => [row.code, row.name, money(row.amount, places)])} headers={["Code", "Name", "Amount"]} />
      </>
    );
    return (
      <div className="card">
        <p>{report.balances ? "The statement balances." : "The statement does not balance."}</p>
        {section("Assets", report.assets as Array<{ code: string; name: string; amount: string }>)}
        {section("Liabilities", report.liabilities as Array<{ code: string; name: string; amount: string }>)}
        {section("Equity", report.equity as Array<{ code: string; name: string; amount: string }>)}
        <p>Unclosed profit or loss {money(String(report.unclosedProfitOrLoss), places)}. {String(report.note)}</p>
        <p>Total assets {money(String(report.totalAssets), places)} · Liabilities and equity {money(String(report.totalLiabilitiesAndEquity), places)}</p>
      </div>
    );
  }
  if (slug === "general-ledger") {
    const lines = report.lines as Array<{ entryNumber: string; entryDate: string; postingDate: string; description: string | null; debit: string; credit: string; runningBalance: string }>;
    return (
      <div className="card">
        <p>Opening {money(String(report.openingBalance), places)} · Closing {money(String(report.closingBalance), places)}</p>
        <AmountTable rows={lines.map((line) => [line.entryNumber, line.entryDate, line.postingDate, line.description ?? "", money(line.debit, places), money(line.credit, places), money(line.runningBalance, places)])} headers={["Entry", "Transaction date", "Posting date", "Description", "Debit", "Credit", "Balance"]} />
      </div>
    );
  }
  const rows = report.rows as Array<{ entryNumber: string; entryDate: string; postingDate: string; accountCode: string; debit: string; credit: string; description: string }>;
  return <div className="card"><AmountTable rows={rows.map((row) => [row.entryNumber, row.entryDate, row.postingDate, row.accountCode, money(row.debit, places), money(row.credit, places)])} headers={["Entry", "Transaction date", "Posting date", "Account", "Debit", "Credit"]} /></div>;
}

function AmountTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <table>
      <thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead>
      <tbody>{rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex} className={cellIndex > 1 ? "num" : ""}>{cell}</td>)}</tr>)}</tbody>
    </table>
  );
}
