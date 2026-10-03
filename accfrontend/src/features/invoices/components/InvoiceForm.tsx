"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { ApiError, api } from "@/lib/api/client";
import { can } from "@/lib/auth/session";
import { todayIso } from "@/lib/formatting";

type Option = { id: string; code?: string; name?: string; displayName?: string; sku?: string; salesPrice?: string; taxCodeId?: string | null; isActive?: boolean };
type TaxCode = { id: string; code: string; name: string; isActive: boolean };

export default function InvoiceForm() {
  const router = useRouter();
  const auth = useAuth();
  const [customers, setCustomers] = useState<Option[]>([]);
  const [branches, setBranches] = useState<Option[]>([]);
  const [products, setProducts] = useState<Option[]>([]);
  const [taxCodes, setTaxCodes] = useState<TaxCode[]>([]);
  const [taxCodesAvailable, setTaxCodesAvailable] = useState(false);
  const [customerId, setCustomerId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(todayIso());
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unitPrice, setUnitPrice] = useState("0.00");
  const [discountAmount, setDiscountAmount] = useState("0");
  const [taxCodeId, setTaxCodeId] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [notices, setNotices] = useState<string[]>([]);

  useEffect(() => {
    if (!auth.user || !can(auth.user, "invoices.create")) return;
    const notes: string[] = [];
    const warnings: string[] = [];
    async function loadCustomers() {
      const rows = await api<{ data: Option[] }>("/api/v1/customers?pageSize=100&active=true");
      setCustomers(rows.data);
      if (rows.data[0]) setCustomerId(rows.data[0].id);
    }
    async function loadProducts() {
      const rows = await api<{ data: Option[] }>("/api/v1/products?pageSize=100&active=true");
      setProducts(rows.data);
      if (rows.data[0]) {
        setProductId(rows.data[0].id);
        setTaxCodeId(rows.data[0].taxCodeId ?? "");
      }
    }
    async function loadBranches() {
      const rows = await api<{ data: Option[] }>("/api/v1/branches/accessible");
      const active = rows.data.filter((row) => row.isActive !== false);
      setBranches(active);
      if (active[0]) setBranchId(active[0].id);
    }
    async function loadTaxCodes() {
      try {
        const rows = await api<{ data: TaxCode[] }>("/api/v1/tax-codes");
        setTaxCodes(rows.data.filter((code) => code.isActive));
        setTaxCodesAvailable(true);
      } catch (caught) {
        if (caught instanceof ApiError && caught.status === 403) {
          warnings.push("Tax codes stay on the product default. Choosing a different code requires tax_codes.view.");
          return;
        }
        notes.push(caught instanceof Error ? caught.message : "Could not load tax codes.");
      }
    }
    Promise.all([
      loadCustomers().catch((caught: unknown) => notes.push(caught instanceof Error ? caught.message : "Could not load customers.")),
      loadProducts().catch((caught: unknown) => notes.push(caught instanceof Error ? caught.message : "Could not load products.")),
      loadBranches().catch((caught: unknown) => notes.push(caught instanceof Error ? caught.message : "Could not load branches.")),
      loadTaxCodes(),
    ]).then(() => {
      setErrors(notes);
      setNotices(warnings);
    });
  }, [auth.user]);

  function chooseProduct(id: string) {
    setProductId(id);
    const product = products.find((row) => row.id === id);
    setTaxCodeId(product?.taxCodeId ?? "");
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setErrors([]);
    const line: { productId: string; quantity: string; unitPrice: string; discountAmount: string; taxCodeId?: string | null } = {
      productId,
      quantity,
      unitPrice,
      discountAmount: discountAmount || "0",
    };
    if (taxCodesAvailable) line.taxCodeId = taxCodeId || null;
    try {
      const created = await api<{ id: string }>("/api/v1/invoices", {
        method: "POST",
        body: JSON.stringify({ customerId, branchId, invoiceDate, lines: [line] }),
      });
      router.push(`/invoices/${created.id}`);
    } catch (caught) {
      setErrors([caught instanceof Error ? caught.message : "Could not create the invoice."]);
    }
  }

  if (!auth.user) return null;
  if (!can(auth.user, "invoices.create")) {
    return (
      <div>
        <h1 className="page-title">New invoice</h1>
        <div className="banner error" role="alert">Creating an invoice requires invoices.create.</div>
      </div>
    );
  }

  const branchNote = auth.user.branchIds
    ? "This list includes only the branches assigned to your user."
    : "No branch is assigned, so you can use every branch.";

  return (
    <div>
      <h1 className="page-title">New invoice</h1>
      <p className="lede">The tax code and discount apply to this line. Choosing a product fills its current tax code. You can choose another code or clear it when tax codes are available. The sales tax account is set on the tax code, not on this screen.</p>
      {errors.length > 0 ? <div className="banner error" role="alert">{errors.map((line) => <p key={line}>{line}</p>)}</div> : null}
      {notices.map((line) => <p key={line}>{line}</p>)}
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
        <p>{branches.length === 0 ? "No active branch is available. Ask a Company Admin to assign a branch to your user, or add a branch, before saving an invoice." : branchNote}</p>
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
          <select value={taxCodeId} onChange={(event) => setTaxCodeId(event.target.value)} disabled={!taxCodesAvailable}>
            <option value="">No tax</option>
            {taxCodes.map((code) => <option key={code.id} value={code.id}>{code.code} {code.name}</option>)}
          </select>
        </label>
        <button className="btn" type="submit">Save draft</button>
      </form>
    </div>
  );
}
