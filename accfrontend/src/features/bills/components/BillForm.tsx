"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api/client";
import { todayIso } from "@/lib/formatting";

type Option = { id: string; code?: string; name?: string; displayName?: string; sku?: string; taxCodeId?: string | null };
type TaxCode = { id: string; code: string; name: string; isActive: boolean };
type Link = { supplierId: string; purchasePrice: string; isPreferred: boolean };

export default function BillForm() {
  const router = useRouter();
  const [suppliers, setSuppliers] = useState<Option[]>([]);
  const [branches, setBranches] = useState<Option[]>([]);
  const [products, setProducts] = useState<Option[]>([]);
  const [taxCodes, setTaxCodes] = useState<TaxCode[]>([]);
  const [supplierId, setSupplierId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [billDate, setBillDate] = useState(todayIso());
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unitPrice, setUnitPrice] = useState("0.00");
  const [discountAmount, setDiscountAmount] = useState("0");
  const [taxCodeId, setTaxCodeId] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      api<{ data: Option[] }>("/api/v1/suppliers?pageSize=100&active=true"),
      api<{ data: Option[] }>("/api/v1/branches/accessible"),
      api<{ data: Option[] }>("/api/v1/products?pageSize=100&active=true"),
      api<{ data: TaxCode[] }>("/api/v1/tax-codes").catch(() => ({ data: [] as TaxCode[] })),
    ]).then(([supplierRows, branchRows, productRows, taxRows]) => {
      setSuppliers(supplierRows.data);
      setBranches(branchRows.data);
      setProducts(productRows.data);
      setTaxCodes(taxRows.data.filter((code) => code.isActive));
      if (supplierRows.data[0]) setSupplierId(supplierRows.data[0].id);
      if (branchRows.data[0]) setBranchId(branchRows.data[0].id);
      if (productRows.data[0]) {
        setProductId(productRows.data[0].id);
        setTaxCodeId(productRows.data[0].taxCodeId ?? "");
      }
    }).catch((caught: Error) => setError(caught.message));
  }, []);

  async function chooseProduct(id: string) {
    setProductId(id);
    const product = products.find((row) => row.id === id);
    setTaxCodeId(product?.taxCodeId ?? "");
    if (!supplierId) return;
    try {
      const links = await api<{ data: Link[] }>(`/api/v1/products/${id}/suppliers`);
      const match = links.data.find((link) => link.supplierId === supplierId && link.isPreferred) ?? links.data.find((link) => link.supplierId === supplierId);
      if (match) setUnitPrice(match.purchasePrice);
    } catch {
      // The price stays as entered when the supplier link cannot be read.
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const created = await api<{ id: string }>("/api/v1/bills", {
        method: "POST",
        body: JSON.stringify({
          supplierId,
          branchId,
          billDate,
          lines: [{ productId, description: description || undefined, quantity, unitPrice, discountAmount: discountAmount || "0", taxCodeId: taxCodeId || null }],
        }),
      });
      router.push(`/bills/${created.id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create the bill.");
    }
  }

  return (
    <div>
      <h1 className="page-title">New supplier bill</h1>
      <p className="lede">The line uses the product purchase expense account and the tax code purchase tax asset. Choosing a linked supplier can fill the purchase price. Stock is not received.</p>
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
        <label className="field"><span>Bill date</span><input type="date" value={billDate} onChange={(event) => setBillDate(event.target.value)} required /></label>
        <label className="field"><span>Product or service</span>
          <select value={productId} onChange={(event) => { void chooseProduct(event.target.value); }} required>
            {products.map((row) => <option key={row.id} value={row.id}>{row.sku} {row.name}</option>)}
          </select>
        </label>
        <label className="field"><span>Description</span><input value={description} onChange={(event) => setDescription(event.target.value)} /></label>
        <label className="field"><span>Quantity</span><input value={quantity} onChange={(event) => setQuantity(event.target.value)} required /></label>
        <label className="field"><span>Unit price</span><input value={unitPrice} onChange={(event) => setUnitPrice(event.target.value)} required /></label>
        <label className="field"><span>Discount</span><input value={discountAmount} onChange={(event) => setDiscountAmount(event.target.value)} /></label>
        <label className="field"><span>Tax code</span>
          <select value={taxCodeId} onChange={(event) => setTaxCodeId(event.target.value)}>
            <option value="">No tax</option>
            {taxCodes.map((code) => <option key={code.id} value={code.id}>{code.code} {code.name}</option>)}
          </select>
        </label>
        <button className="btn" type="submit">Create bill</button>
      </form>
    </div>
  );
}
