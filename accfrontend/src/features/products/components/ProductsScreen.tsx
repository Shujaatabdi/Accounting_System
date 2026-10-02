"use client";

import { FormEvent, useEffect, useState } from "react";
import { api } from "@/lib/api/client";

type Account = { id: string; code: string; name: string; accountType: string };
type Product = { id: string; sku: string; name: string; itemType: string; salesPrice: string; isActive: boolean };

export default function ProductsScreen() {
  const [rows, setRows] = useState<Product[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [error, setError] = useState("");
  const [sku, setSku] = useState("");
  const [name, setName] = useState("");
  const [itemType, setItemType] = useState("service");
  const [salesPrice, setSalesPrice] = useState("0.00");
  const [salesAccountId, setSalesAccountId] = useState("");
  const [returnAccountId, setReturnAccountId] = useState("");

  useEffect(() => {
    Promise.all([
      api<{ data: Product[] }>("/api/v1/products?pageSize=100"),
      api<{ data: Account[] }>("/api/v1/accounts?postable=true&pageSize=100"),
    ]).then(([products, accountRows]) => {
      setRows(products.data);
      const income = accountRows.data.filter((account) => account.accountType === "income");
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
        body: JSON.stringify({ sku, name, itemType, salesPrice, salesAccountId, returnAccountId, isActive: true, units: [] }),
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
      <p className="lede">Stock items are catalog records in this phase. Quantity, valuation, and cost of goods sold are not posted.</p>
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
    </div>
  );
}
