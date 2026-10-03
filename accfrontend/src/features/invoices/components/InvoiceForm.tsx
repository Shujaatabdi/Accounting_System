"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api/client";
import { todayIso } from "@/lib/formatting";

type Option = { id: string; code?: string; name?: string; displayName?: string; sku?: string; salesPrice?: string; taxCodeId?: string | null };
type TaxCode = { id: string; code: string; name: string; isActive: boolean };

export default function InvoiceForm() {
  const router = useRouter();
  const [customers, setCustomers] = useState<Option[]>([]);
  const [branches, setBranches] = useState<Option[]>([]);
  const [products, setProducts] = useState<Option[]>([]);
  const [taxCodes, setTaxCodes] = useState<TaxCode[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(todayIso());
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unitPrice, setUnitPrice] = useState("0.00");
  const [discountAmount, setDiscountAmount] = useState("0");
  const [taxCodeId, setTaxCodeId] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      api<{ data: Option[] }>("/api/v1/customers?pageSize=100&active=true"),
      api<{ data: Option[] }>("/api/v1/branches?pageSize=100"),
      api<{ data: Option[] }>("/api/v1/products?pageSize=100&active=true"),
      api<{ data: TaxCode[] }>("/api/v1/tax-codes").catch(() => ({ data: [] as TaxCode[] })),
    ]).then(([customerRows, branchRows, productRows, taxRows]) => {
      setCustomers(customerRows.data);
      setBranches(branchRows.data);
      setProducts(productRows.data);
      setTaxCodes(taxRows.data.filter((code) => code.isActive));
      if (customerRows.data[0]) setCustomerId(customerRows.data[0].id);
      if (branchRows.data[0]) setBranchId(branchRows.data[0].id);
      if (productRows.data[0]) {
        setProductId(productRows.data[0].id);
        setTaxCodeId(productRows.data[0].taxCodeId ?? "");
      }
    }).catch((caught: Error) => setError(caught.message));
  }, []);

  function chooseProduct(id: string) {
    setProductId(id);
    const product = products.find((row) => row.id === id);
    setTaxCodeId(product?.taxCodeId ?? "");
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const created = await api<{ id: string }>("/api/v1/invoices", {
        method: "POST",
        body: JSON.stringify({
          customerId,
          branchId,
          invoiceDate,
          lines: [{ productId, quantity, unitPrice, discountAmount: discountAmount || "0", taxCodeId: taxCodeId || null }],
        }),
      });
      router.push(`/invoices/${created.id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create the invoice.");
    }
  }

  return (
    <div>
      <h1 className="page-title">New invoice</h1>
      <p className="lede">The tax code and discount apply to this line. Choosing a product fills its current tax code. You can choose another code or clear it. The sales tax account is set on the tax code, not on this screen.</p>
      {error ? <div className="banner error">{error}</div> : null}
      <form className="card grid" onSubmit={onSubmit}>
        <label className="field"><span>Customer</span>
          <select value={customerId} onChange={(event) => setCustomerId(event.target.value)} required>
            {customers.map((row) => <option key={row.id} value={row.id}>{row.code} {row.displayName}</option>)}
          </select>
        </label>
        <label className="field"><span>Branch</span>
          <select value={branchId} onChange={(event) => setBranchId(event.target.value)} required>
            {branches.map((row) => <option key={row.id} value={row.id}>{row.code} {row.name}</option>)}
          </select>
        </label>
        <label className="field"><span>Invoice date</span><input type="date" value={invoiceDate} onChange={(event) => setInvoiceDate(event.target.value)} required /></label>
        <label className="field"><span>Product</span>
          <select value={productId} onChange={(event) => chooseProduct(event.target.value)} required>
            {products.map((row) => <option key={row.id} value={row.id}>{row.sku} {row.name}</option>)}
          </select>
        </label>
        <label className="field"><span>Quantity</span><input value={quantity} onChange={(event) => setQuantity(event.target.value)} required /></label>
        <label className="field"><span>Unit price</span><input value={unitPrice} onChange={(event) => setUnitPrice(event.target.value)} required /></label>
        <label className="field"><span>Discount</span><input value={discountAmount} onChange={(event) => setDiscountAmount(event.target.value)} /></label>
        <label className="field"><span>Tax code</span>
          <select value={taxCodeId} onChange={(event) => setTaxCodeId(event.target.value)}>
            <option value="">No tax</option>
            {taxCodes.map((code) => <option key={code.id} value={code.id}>{code.code} {code.name}</option>)}
          </select>
        </label>
        <button className="btn" type="submit">Save draft</button>
      </form>
    </div>
  );
}
