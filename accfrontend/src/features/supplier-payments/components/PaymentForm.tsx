"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api/client";
import { todayIso } from "@/lib/formatting";

type Option = { id: string; code?: string; name?: string; displayName?: string };
type Account = { id: string; code: string; name: string; accountType: string };
type Bill = { id: string; billNumber: string; status: string };

export default function PaymentForm() {
  const router = useRouter();
  const [suppliers, setSuppliers] = useState<Option[]>([]);
  const [branches, setBranches] = useState<Option[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [supplierId, setSupplierId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [cashAccountId, setCashAccountId] = useState("");
  const [paymentDate, setPaymentDate] = useState(todayIso());
  const [amount, setAmount] = useState("0.00");
  const [billId, setBillId] = useState("");
  const [allocation, setAllocation] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      api<{ data: Option[] }>("/api/v1/suppliers?pageSize=100&active=true"),
      api<{ data: Option[] }>("/api/v1/branches/accessible"),
      api<{ data: Account[] }>("/api/v1/accounts?postable=true&pageSize=100"),
    ]).then(([supplierRows, branchRows, accountRows]) => {
      setSuppliers(supplierRows.data);
      setBranches(branchRows.data);
      const assets = accountRows.data.filter((account) => account.accountType === "asset");
      setAccounts(assets);
      if (supplierRows.data[0]) setSupplierId(supplierRows.data[0].id);
      if (branchRows.data[0]) setBranchId(branchRows.data[0].id);
      if (assets[0]) setCashAccountId(assets[0].id);
    }).catch((caught: Error) => setError(caught.message));
  }, []);

  useEffect(() => {
    if (!supplierId) return;
    api<{ data: Bill[] }>(`/api/v1/bills?supplierId=${supplierId}&status=posted&pageSize=100`)
      .then((result) => {
        const open = result.data.filter((row) => row.status === "posted");
        setBills(open);
        setBillId(open[0]?.id ?? "");
      })
      .catch(() => setBills([]));
  }, [supplierId]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const created = await api<{ id: string }>("/api/v1/supplier-payments", {
        method: "POST",
        body: JSON.stringify({
          supplierId,
          branchId,
          paymentDate,
          cashAccountId,
          amount,
          allocations: billId && allocation ? [{ billId, amount: allocation }] : [],
        }),
      });
      router.push(`/supplier-payments/${created.id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create the payment.");
    }
  }

  return (
    <div>
      <h1 className="page-title">New supplier payment</h1>
      <p className="lede">Leave the allocation blank, or lower than the payment, only after a supplier advance asset account is configured. One payment can be allocated to more bills after it is posted.</p>
      {error ? <div className="banner error">{error}</div> : null}
      <form className="card grid" onSubmit={onSubmit}>
        <label className="field"><span>Supplier</span>
          <select value={supplierId} onChange={(event) => setSupplierId(event.target.value)} required>
            {suppliers.map((row) => <option key={row.id} value={row.id}>{row.code} {row.displayName}</option>)}
          </select>
        </label>
        <label className="field"><span>Branch</span>
          <select value={branchId} onChange={(event) => setBranchId(event.target.value)} required>
            {branches.map((row) => <option key={row.id} value={row.id}>{row.code} {row.name}</option>)}
          </select>
        </label>
        <label className="field"><span>Date</span><input type="date" value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} required /></label>
        <label className="field"><span>Cash or bank</span>
          <select value={cashAccountId} onChange={(event) => setCashAccountId(event.target.value)} required>
            {accounts.map((account) => <option key={account.id} value={account.id}>{account.code} {account.name}</option>)}
          </select>
        </label>
        <label className="field"><span>Amount</span><input value={amount} onChange={(event) => setAmount(event.target.value)} required /></label>
        <label className="field"><span>Bill</span>
          <select value={billId} onChange={(event) => setBillId(event.target.value)}>
            <option value="">No allocation yet</option>
            {bills.map((row) => <option key={row.id} value={row.id}>{row.billNumber}</option>)}
          </select>
        </label>
        <label className="field"><span>Amount applied to the bill</span><input value={allocation} onChange={(event) => setAllocation(event.target.value)} /></label>
        <button className="btn" type="submit">Create payment</button>
      </form>
    </div>
  );
}
