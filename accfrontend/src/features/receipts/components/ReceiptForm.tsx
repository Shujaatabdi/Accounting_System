"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api/client";
import { todayIso } from "@/lib/formatting";

type Option = { id: string; code: string; name?: string; displayName?: string; accountType?: string };

export default function ReceiptForm() {
  const router = useRouter();
  const [customers, setCustomers] = useState<Option[]>([]);
  const [branches, setBranches] = useState<Option[]>([]);
  const [accounts, setAccounts] = useState<Option[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [cashAccountId, setCashAccountId] = useState("");
  const [receiptDate, setReceiptDate] = useState(todayIso());
  const [amount, setAmount] = useState("0.00");
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      api<{ data: Option[] }>("/api/v1/customers?pageSize=100&active=true"),
      api<{ data: Option[] }>("/api/v1/branches?pageSize=100"),
      api<{ data: Option[] }>("/api/v1/accounts?postable=true&pageSize=100"),
    ]).then(([customerRows, branchRows, accountRows]) => {
      setCustomers(customerRows.data);
      setBranches(branchRows.data);
      const assets = accountRows.data.filter((account) => account.accountType === "asset");
      setAccounts(assets);
      if (customerRows.data[0]) setCustomerId(customerRows.data[0].id);
      if (branchRows.data[0]) setBranchId(branchRows.data[0].id);
      if (assets[0]) setCashAccountId(assets[0].id);
    }).catch((caught: Error) => setError(caught.message));
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const created = await api<{ id: string }>("/api/v1/receipts", {
        method: "POST",
        body: JSON.stringify({ customerId, branchId, receiptDate, cashAccountId, amount, allocations: [] }),
      });
      router.push(`/receipts/${created.id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create the receipt.");
    }
  }

  return (
    <div>
      <h1 className="page-title">New receipt</h1>
      {error ? <div className="banner error">{error}</div> : null}
      <form className="card grid" onSubmit={onSubmit}>
        <label className="field"><span>Customer</span>
          <select value={customerId} onChange={(event) => setCustomerId(event.target.value)}>{customers.map((row) => <option key={row.id} value={row.id}>{row.code} {row.displayName}</option>)}</select>
        </label>
        <label className="field"><span>Branch</span>
          <select value={branchId} onChange={(event) => setBranchId(event.target.value)}>{branches.map((row) => <option key={row.id} value={row.id}>{row.code} {row.name}</option>)}</select>
        </label>
        <label className="field"><span>Cash or bank</span>
          <select value={cashAccountId} onChange={(event) => setCashAccountId(event.target.value)}>{accounts.map((row) => <option key={row.id} value={row.id}>{row.code} {row.name}</option>)}</select>
        </label>
        <label className="field"><span>Date</span><input type="date" value={receiptDate} onChange={(event) => setReceiptDate(event.target.value)} required /></label>
        <label className="field"><span>Amount</span><input value={amount} onChange={(event) => setAmount(event.target.value)} required /></label>
        <button className="btn" type="submit">Save draft</button>
      </form>
    </div>
  );
}
