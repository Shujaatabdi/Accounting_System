"use client";

import { FormEvent, useEffect, useState } from "react";
import { api, downloadCsv } from "@/lib/api/client";
import { can } from "@/lib/auth/session";
import { money, todayIso } from "@/lib/formatting";
import { useAuth } from "@/hooks/use-auth";

const TITLES: Record<string, string> = {
  "trial-balance": "Trial balance",
  "profit-and-loss": "Profit and loss",
  "balance-sheet": "Balance sheet",
  "general-ledger": "General ledger",
  journals: "Journal report",
  "receivables-aging": "Receivables aging",
  "customer-statement": "Customer statement",
  sales: "Sales",
};

export function ReportScreen({ slug }: { slug: string }) {
  const auth = useAuth();
  const [asOf, setAsOf] = useState(todayIso());
  const [from, setFrom] = useState(`${todayIso().slice(0, 4)}-01-01`);
  const [to, setTo] = useState(todayIso());
  const [accountId, setAccountId] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [customers, setCustomers] = useState<Array<{ id: string; code: string; displayName: string }>>([]);
  const [accounts, setAccounts] = useState<Array<{ id: string; code: string; name: string }>>([]);
  const [report, setReport] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (slug === "general-ledger") {
      api<{ data: Array<{ id: string; code: string; name: string }> }>("/api/v1/accounts?postable=true&pageSize=100")
        .then((result) => setAccounts(result.data))
        .catch((caught: Error) => setError(caught.message));
    }
    if (slug === "customer-statement") {
      api<{ data: Array<{ id: string; code: string; displayName: string }> }>("/api/v1/customers?pageSize=100")
        .then((result) => setCustomers(result.data))
        .catch((caught: Error) => setError(caught.message));
    }
  }, [slug]);

  async function run(event?: FormEvent) {
    event?.preventDefault();
    setError("");
    const query = new URLSearchParams();
    if (slug === "trial-balance" || slug === "balance-sheet" || slug === "receivables-aging") query.set("asOf", asOf);
    else {
      query.set("from", from);
      query.set("to", to);
    }
    if (slug === "general-ledger") query.set("accountId", accountId);
    if (slug === "customer-statement") query.set("customerId", customerId);
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
        {slug === "trial-balance" || slug === "balance-sheet" || slug === "receivables-aging" ? (
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
        {slug === "customer-statement" ? (
          <label className="field"><span>Customer</span>
            <select value={customerId} onChange={(event) => setCustomerId(event.target.value)} required>
              <option value="">Select</option>
              {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.code} {customer.displayName}</option>)}
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
    if (slug === "trial-balance" || slug === "balance-sheet" || slug === "receivables-aging") query.set("asOf", asOf);
    else {
      query.set("from", from);
      query.set("to", to);
    }
    if (accountId) query.set("accountId", accountId);
    if (customerId) query.set("customerId", customerId);
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
  if (slug === "receivables-aging") {
    const rows = report.invoices as Array<{ invoiceNumber: string; customerName: string; dueDate: string; openAmount: string; bucket: string }>;
    const totals = report.totals as { open: string };
    return <div className="card"><p>Open {money(totals.open, places)}. Unapplied advances are not included.</p><AmountTable rows={rows.map((row) => [row.invoiceNumber, row.customerName, row.dueDate, money(row.openAmount, places), row.bucket])} headers={["Invoice", "Customer", "Due", "Open", "Bucket"]} /></div>;
  }
  if (slug === "customer-statement") {
    const rows = report.lines as Array<{ kind: string; number: string; date: string; amount: string; balance: string }>;
    return <div className="card"><p>Opening {money(String(report.openingBalance), places)} · Closing {money(String(report.closingBalance), places)}</p><AmountTable rows={rows.map((row) => [row.kind, row.number, row.date, money(row.amount, places), money(row.balance, places)])} headers={["Kind", "Number", "Date", "Amount", "Balance"]} /></div>;
  }
  if (slug === "sales") {
    const rows = report.rows as Array<{ kind: string; number: string; date: string; customerName: string; taxable: string; tax: string; total: string }>;
    return <div className="card"><p>Total {money(String(report.total), places)}</p><AmountTable rows={rows.map((row) => [row.kind, row.number, row.date, row.customerName, money(row.taxable, places), money(row.tax, places), money(row.total, places)])} headers={["Kind", "Number", "Date", "Customer", "Taxable", "Tax", "Total"]} /></div>;
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
