"use client";

import { FormEvent, useEffect, useState } from "react";
import { api } from "@/lib/api/client";

type Account = { id: string; code: string; name: string; accountType: string };
type TaxCode = { id: string; code: string; name: string; isActive: boolean };
type Product = { id: string; sku: string; name: string; itemType: string; salesPrice: string; taxCodeId: string | null; isActive: boolean };
type Supplier = { id: string; code: string; displayName: string };
type Link = { supplierId: string; supplierCode: string; supplierName: string; supplierItemCode: string | null; purchasePrice: string; leadTimeDays: number; isPreferred: boolean };

export default function ProductsScreen() {
  const [rows, setRows] = useState<Product[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [taxCodes, setTaxCodes] = useState<TaxCode[]>([]);
  const [taxCodeId, setTaxCodeId] = useState("");
  const [error, setError] = useState("");
  const [sku, setSku] = useState("");
  const [name, setName] = useState("");
  const [itemType, setItemType] = useState("service");
  const [salesPrice, setSalesPrice] = useState("0.00");
  const [salesAccountId, setSalesAccountId] = useState("");
  const [returnAccountId, setReturnAccountId] = useState("");
  const [purchaseAccountId, setPurchaseAccountId] = useState("");
  const [expenses, setExpenses] = useState<Account[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [linkProductId, setLinkProductId] = useState("");
  const [links, setLinks] = useState<Link[]>([]);
  const [linkSupplierId, setLinkSupplierId] = useState("");
  const [itemCode, setItemCode] = useState("");
  const [purchasePrice, setPurchasePrice] = useState("0.00");
  const [leadTimeDays, setLeadTimeDays] = useState("0");
  const [preferred, setPreferred] = useState(false);

  useEffect(() => {
    Promise.all([
      api<{ data: Product[] }>("/api/v1/products?pageSize=100"),
      api<{ data: Account[] }>("/api/v1/accounts?postable=true&pageSize=100"),
      api<{ data: TaxCode[] }>("/api/v1/tax-codes").catch(() => ({ data: [] as TaxCode[] })),
      api<{ data: Supplier[] }>("/api/v1/suppliers?pageSize=100&active=true").catch(() => ({ data: [] as Supplier[] })),
    ]).then(([products, accountRows, taxRows, supplierRows]) => {
      setRows(products.data);
      setTaxCodes(taxRows.data.filter((code) => code.isActive));
      setSuppliers(supplierRows.data);
      const income = accountRows.data.filter((account) => account.accountType === "income");
      setExpenses(accountRows.data.filter((account) => account.accountType === "expense"));
      setAccounts(income);
      if (income[0]) {
        setSalesAccountId(income[0].id);
        setReturnAccountId(income[0].id);
      }
    }).catch((caught: Error) => setError(caught.message));
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      await api("/api/v1/products", {
        method: "POST",
        body: JSON.stringify({ sku, name, itemType, salesPrice, salesAccountId, returnAccountId, purchaseAccountId: purchaseAccountId || null, taxCodeId: taxCodeId || null, isActive: true, units: [] }),
      });
      setSku(""); setName("");
      setRows((await api<{ data: Product[] }>("/api/v1/products?pageSize=100")).data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save the product.");
    }
  }

  return (
    <div>
      <h1 className="page-title">Products and services</h1>
      <p className="lede">Stock items are catalog records. Quantity, valuation, and cost of goods sold are not posted. A purchase account is an expense account used by supplier bills.</p>
      {error ? <div className="banner error">{error}</div> : null}
      <form className="card grid" onSubmit={onSubmit}>
        <label className="field"><span>SKU</span><input value={sku} onChange={(event) => setSku(event.target.value)} required /></label>
        <label className="field"><span>Name</span><input value={name} onChange={(event) => setName(event.target.value)} required /></label>
        <label className="field"><span>Type</span>
          <select value={itemType} onChange={(event) => setItemType(event.target.value)}>
            <option value="service">Service</option>
            <option value="non_stock">Non-stock</option>
            <option value="stock">Stock</option>
          </select>
        </label>
        <label className="field"><span>Sales price</span><input value={salesPrice} onChange={(event) => setSalesPrice(event.target.value)} required /></label>
        <label className="field"><span>Sales account</span>
          <select value={salesAccountId} onChange={(event) => setSalesAccountId(event.target.value)} required>
            {accounts.map((account) => <option key={account.id} value={account.id}>{account.code} {account.name}</option>)}
          </select>
        </label>
        <label className="field"><span>Default tax code</span>
          <select value={taxCodeId} onChange={(event) => setTaxCodeId(event.target.value)}>
            <option value="">No tax</option>
            {taxCodes.map((code) => <option key={code.id} value={code.id}>{code.code} {code.name}</option>)}
          </select>
        </label>
        <label className="field"><span>Purchase account</span>
          <select value={purchaseAccountId} onChange={(event) => setPurchaseAccountId(event.target.value)}>
            <option value="">Not set</option>
            {expenses.map((account) => <option key={account.id} value={account.id}>{account.code} {account.name}</option>)}
          </select>
        </label>
        <label className="field"><span>Return account</span>
          <select value={returnAccountId} onChange={(event) => setReturnAccountId(event.target.value)} required>
            {accounts.map((account) => <option key={account.id} value={account.id}>{account.code} {account.name}</option>)}
          </select>
        </label>
        <button className="btn" type="submit">Add product</button>
      </form>
      <div className="card">
        <table>
          <thead><tr><th>SKU</th><th>Name</th><th>Type</th><th>Price</th></tr></thead>
          <tbody>{rows.map((row) => <tr key={row.id}><td>{row.sku}</td><td>{row.name}</td><td>{row.itemType}</td><td>{row.salesPrice}</td></tr>)}</tbody>
        </table>
      </div>
      <form className="card grid" onSubmit={saveLink}>
        <h2>Supplier links</h2>
        <p>A product can have several suppliers. One can be preferred. Lead time is recorded only. It does not create a stock receipt.</p>
        <label className="field"><span>Product</span>
          <select value={linkProductId} onChange={(event) => { setLinkProductId(event.target.value); void loadLinks(event.target.value); }}>
            <option value="">Select</option>
            {rows.map((row) => <option key={row.id} value={row.id}>{row.sku} {row.name}</option>)}
          </select>
        </label>
        <label className="field"><span>Supplier</span>
          <select value={linkSupplierId} onChange={(event) => setLinkSupplierId(event.target.value)}>
            <option value="">Select</option>
            {suppliers.map((row) => <option key={row.id} value={row.id}>{row.code} {row.displayName}</option>)}
          </select>
        </label>
        <label className="field"><span>Supplier item code</span><input value={itemCode} onChange={(event) => setItemCode(event.target.value)} /></label>
        <label className="field"><span>Purchase price</span><input value={purchasePrice} onChange={(event) => setPurchasePrice(event.target.value)} required /></label>
        <label className="field"><span>Lead time (days)</span><input value={leadTimeDays} onChange={(event) => setLeadTimeDays(event.target.value)} required /></label>
        <label className="field"><span>Preferred</span>
          <select value={preferred ? "yes" : "no"} onChange={(event) => setPreferred(event.target.value === "yes")}>
            <option value="no">No</option>
            <option value="yes">Yes</option>
          </select>
        </label>
        <button className="btn" type="submit">Save supplier link</button>
        <table>
          <thead><tr><th>Supplier</th><th>Item code</th><th>Price</th><th>Lead time</th><th>Preferred</th></tr></thead>
          <tbody>{links.map((link) => <tr key={link.supplierId}><td>{link.supplierCode} {link.supplierName}</td><td>{link.supplierItemCode ?? ""}</td><td>{link.purchasePrice}</td><td>{link.leadTimeDays}</td><td>{link.isPreferred ? "Yes" : ""}</td></tr>)}</tbody>
        </table>
      </form>
    </div>
  );

  async function loadLinks(productId: string) {
    if (!productId) {
      setLinks([]);
      return;
    }
    setLinks((await api<{ data: Link[] }>(`/api/v1/products/${productId}/suppliers`)).data);
  }

  async function saveLink(event: FormEvent) {
    event.preventDefault();
    if (!linkProductId || !linkSupplierId) return;
    setError("");
    try {
      const current = (await api<{ data: Link[] }>(`/api/v1/products/${linkProductId}/suppliers`)).data;
      const next = current.filter((link) => link.supplierId !== linkSupplierId);
      if (preferred) next.forEach((link) => { link.isPreferred = false; });
      next.push({
        supplierId: linkSupplierId,
        supplierCode: "",
        supplierName: "",
        supplierItemCode: itemCode || null,
        purchasePrice,
        leadTimeDays: Number(leadTimeDays),
        isPreferred: preferred,
      });
      const saved = await api<{ data: Link[] }>(`/api/v1/products/${linkProductId}/suppliers`, {
        method: "PUT",
        body: JSON.stringify({
          suppliers: next.map((link) => ({
            supplierId: link.supplierId,
            supplierItemCode: link.supplierItemCode,
            purchasePrice: link.purchasePrice,
            leadTimeDays: link.leadTimeDays,
            isPreferred: link.isPreferred,
          })),
        }),
      });
      setLinks(saved.data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save the supplier link.");
    }
  }
}
