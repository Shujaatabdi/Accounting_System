"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api/client";
import { todayIso } from "@/lib/formatting";

type Option = { id: string; code?: string; name?: string; displayName?: string; sku?: string };
type Account = { id: string; code: string; name: string; accountType: string };
type TaxCode = { id: string; code: string; name: string; isActive: boolean };
type Bill = { id: string; billNumber: string; lines?: Array<{ id: string; description: string; quantity: string }> };

export default function ReturnForm() {
  const router = useRouter();
  const [suppliers, setSuppliers] = useState<Option[]>([]);
  const [branches, setBranches] = useState<Option[]>([]);
  const [products, setProducts] = useState<Option[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [taxCodes, setTaxCodes] = useState<TaxCode[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [supplierId, setSupplierId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [returnDate, setReturnDate] = useState(todayIso());
  const [reason, setReason] = useState("");
  const [unreferenced, setUnreferenced] = useState(false);
  const [billId, setBillId] = useState("");
  const [billLineId, setBillLineId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [productId, setProductId] = useState("");
  const [unitPrice, setUnitPrice] = useState("0.00");
  const [taxCodeId, setTaxCodeId] = useState("");
  const [purchaseAccountId, setPurchaseAccountId] = useState("");
  const [disposition, setDisposition] = useState<"restockable" | "damaged" | "non_restockable">("restockable");
  const [error, setError] = useState("");
  const lines = bills.find((bill) => bill.id === billId)?.lines ?? [];

  useEffect(() => {
    Promise.all([
      api<{ data: Option[] }>("/api/v1/suppliers?pageSize=100&active=true"),
      api<{ data: Option[] }>("/api/v1/branches?pageSize=100"),
      api<{ data: Option[] }>("/api/v1/products?pageSize=100&active=true"),
      api<{ data: Account[] }>("/api/v1/accounts?postable=true&pageSize=100"),
      api<{ data: TaxCode[] }>("/api/v1/tax-codes").catch(() => ({ data: [] as TaxCode[] })),
    ]).then(([supplierRows, branchRows, productRows, accountRows, taxRows]) => {
      setSuppliers(supplierRows.data);
      setBranches(branchRows.data);
      setProducts(productRows.data);
      setAccounts(accountRows.data.filter((account) => account.accountType === "expense"));
      setTaxCodes(taxRows.data.filter((code) => code.isActive));
      if (supplierRows.data[0]) setSupplierId(supplierRows.data[0].id);
      if (branchRows.data[0]) setBranchId(branchRows.data[0].id);
      if (productRows.data[0]) setProductId(productRows.data[0].id);
      if (accountRows.data[0]) setPurchaseAccountId(accountRows.data.find((account) => account.accountType === "expense")?.id ?? "");
    }).catch((caught: Error) => setError(caught.message));
  }, []);

  useEffect(() => {
    if (!supplierId) return;
    api<{ data: Array<{ id: string; billNumber: string; status: string }> }>(`/api/v1/bills?supplierId=${supplierId}&status=posted&pageSize=100`)
      .then(async (result) => {
        const detailed = await Promise.all(result.data.filter((row) => row.status === "posted").map(async (row) => {
          const bill = await api<Bill>(`/api/v1/bills/${row.id}`);
          return { id: bill.id, billNumber: row.billNumber, lines: bill.lines };
        }));
        setBills(detailed);
        setBillId(detailed[0]?.id ?? "");
        setBillLineId(detailed[0]?.lines?.[0]?.id ?? "");
      })
      .catch(() => setBills([]));
  }, [supplierId]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    const line = unreferenced
      ? { productId, quantity, unitPrice, taxCodeId: taxCodeId || null, purchaseAccountId, disposition }
      : { billLineId, quantity, disposition };
    try {
      const created = await api<{ id: string }>("/api/v1/supplier-returns", {
        method: "POST",
        body: JSON.stringify({ supplierId, branchId, returnDate, reason, unreferenced, lines: [line] }),
      });
      router.push(`/supplier-returns/${created.id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create the return.");
    }
  }

  return (
    <div>
      <h1 className="page-title">New supplier return</h1>
      <p className="lede">A linked return must name the bill line. Disposition is recorded for a later stock phase and does not change inventory value. An unreferenced return needs its own permission, reason, price, tax, and purchase account.</p>
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
        <label className="field"><span>Date</span><input type="date" value={returnDate} onChange={(event) => setReturnDate(event.target.value)} required /></label>
        <label className="field"><span>Reason</span><input value={reason} onChange={(event) => setReason(event.target.value)} required /></label>
        <label className="field"><span>Source</span>
          <select value={unreferenced ? "unreferenced" : "bill"} onChange={(event) => setUnreferenced(event.target.value === "unreferenced")}>
            <option value="bill">Linked to a bill line</option>
            <option value="unreferenced">Unreferenced</option>
          </select>
        </label>
        {unreferenced ? (
          <>
            <label className="field"><span>Product</span>
              <select value={productId} onChange={(event) => setProductId(event.target.value)} required>
                {products.map((row) => <option key={row.id} value={row.id}>{row.sku} {row.name}</option>)}
              </select>
            </label>
            <label className="field"><span>Unit price</span><input value={unitPrice} onChange={(event) => setUnitPrice(event.target.value)} required /></label>
            <label className="field"><span>Tax code</span>
              <select value={taxCodeId} onChange={(event) => setTaxCodeId(event.target.value)}>
                <option value="">No tax</option>
                {taxCodes.map((code) => <option key={code.id} value={code.id}>{code.code} {code.name}</option>)}
              </select>
            </label>
            <label className="field"><span>Purchase account</span>
              <select value={purchaseAccountId} onChange={(event) => setPurchaseAccountId(event.target.value)} required>
                {accounts.map((account) => <option key={account.id} value={account.id}>{account.code} {account.name}</option>)}
              </select>
            </label>
          </>
        ) : (
          <>
            <label className="field"><span>Bill</span>
              <select value={billId} onChange={(event) => { setBillId(event.target.value); setBillLineId(bills.find((bill) => bill.id === event.target.value)?.lines?.[0]?.id ?? ""); }} required>
                {bills.map((row) => <option key={row.id} value={row.id}>{row.billNumber}</option>)}
              </select>
            </label>
            <label className="field"><span>Bill line</span>
              <select value={billLineId} onChange={(event) => setBillLineId(event.target.value)} required>
                {lines.map((line) => <option key={line.id} value={line.id}>{line.description} ({line.quantity})</option>)}
              </select>
            </label>
          </>
        )}
        <label className="field"><span>Quantity</span><input value={quantity} onChange={(event) => setQuantity(event.target.value)} required /></label>
        <label className="field"><span>Disposition</span>
          <select value={disposition} onChange={(event) => setDisposition(event.target.value as typeof disposition)}>
            <option value="restockable">Restockable</option>
            <option value="damaged">Damaged</option>
            <option value="non_restockable">Non-restockable</option>
          </select>
        </label>
        <button className="btn" type="submit">Create return</button>
      </form>
    </div>
  );
}
