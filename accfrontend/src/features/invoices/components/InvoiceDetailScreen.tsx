"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api/client";

type Line = {
  id: string;
  productId: string | null;
  description: string;
  quantity: string;
  unitPrice: string;
  discountAmount: string;
  taxCodeId: string | null;
  taxRate: string;
  taxAmount: string;
  lineTotal: string;
};
type TaxDetails = {
  taxCountryCode: string | null;
  taxIdentifier: string | null;
  partyType: string | null;
  cnicNtn: string | null;
  strn: string | null;
} | null;
type Invoice = {
  id: string;
  invoiceNumber: string;
  customerId: string;
  customerName: string;
  branchId: string;
  status: string;
  invoiceDate: string;
  dueDate: string;
  paymentTermsDays: number;
  notes: string | null;
  total: string;
  taxTotal: string;
  lines: Line[];
  customerTaxIdentifiers: TaxDetails;
};
type TaxCode = { id: string; code: string; name: string; isActive: boolean };

const partyLabel: Record<string, string> = { individual: "Individual", company: "Company", aop: "AOP" };

export default function InvoiceDetailScreen({ id }: { id: string }) {
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [taxCodes, setTaxCodes] = useState<TaxCode[]>([]);
  const [error, setError] = useState("");
  const [reason, setReason] = useState("");

  async function load() {
    const current = await api<Invoice>(`/api/v1/invoices/${id}`);
    setInvoice(current);
    setLines(current.lines);
  }
  useEffect(() => {
    load().catch((caught: Error) => setError(caught.message));
    api<{ data: TaxCode[] }>("/api/v1/tax-codes").then((result) => setTaxCodes(result.data)).catch(() => setTaxCodes([]));
  }, [id]);

  async function act(path: string, body?: unknown) {
    setError("");
    try {
      const current = await api<Invoice>(`/api/v1/invoices/${id}/${path}`, { method: "POST", body: JSON.stringify(body ?? {}) });
      setInvoice(current);
      setLines(current.lines);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The invoice action failed.");
    }
  }

  async function saveDraft() {
    if (!invoice) return;
    setError("");
    try {
      const current = await api<Invoice>(`/api/v1/invoices/${id}`, {
        method: "PUT",
        body: JSON.stringify({
          customerId: invoice.customerId,
          branchId: invoice.branchId,
          invoiceDate: invoice.invoiceDate,
          dueDate: invoice.dueDate,
          paymentTermsDays: invoice.paymentTermsDays,
          notes: invoice.notes,
          lines: lines.map((line) => ({
            productId: line.productId,
            description: line.description,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            discountAmount: line.discountAmount || "0",
            taxCodeId: line.taxCodeId,
          })),
        }),
      });
      setInvoice(current);
      setLines(current.lines);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save the draft.");
    }
  }

  if (!invoice) return <p>{error || "Loading…"}</p>;
  const editable = invoice.status === "draft" || invoice.status === "rejected";
  const details = invoice.customerTaxIdentifiers;
  return (
    <div>
      <h1 className="page-title">{invoice.invoiceNumber}</h1>
      <p className="lede">{invoice.customerName} · {invoice.invoiceDate} · due {invoice.dueDate} · {invoice.status}</p>
      {error ? <div className="banner error">{error}</div> : null}
      {details ? (
        <div className="card">
          <h2>Customer tax details</h2>
          <p>These are the details copied when the invoice was posted. They are not claimed to be legally required. A printed NTN check digit is stored for display and is not verified.</p>
          {details.taxCountryCode ? <p>Tax country {details.taxCountryCode}</p> : null}
          {details.taxIdentifier ? <p>Tax identifier {details.taxIdentifier}</p> : null}
          {details.partyType ? <p>Party type {partyLabel[details.partyType] ?? details.partyType}</p> : null}
          {details.cnicNtn ? <p>CNIC/NTN {details.cnicNtn}</p> : null}
          {details.strn ? <p>STRN {details.strn}</p> : null}
        </div>
      ) : null}
      <div className="card">
        <table>
          <thead><tr><th>Description</th><th>Qty</th><th>Price</th><th>Discount</th><th>Tax code</th><th>Tax</th><th>Total</th></tr></thead>
          <tbody>
            {lines.map((line, index) => (
              <tr key={line.id}>
                <td>{line.description}</td>
                <td>{line.quantity}</td>
                <td>{line.unitPrice}</td>
                <td>
                  {editable ? (
                    <input value={line.discountAmount} onChange={(event) => setLines(lines.map((item, itemIndex) => itemIndex === index ? { ...item, discountAmount: event.target.value } : item))} />
                  ) : line.discountAmount}
                </td>
                <td>
                  {editable ? (
                    <select value={line.taxCodeId ?? ""} onChange={(event) => setLines(lines.map((item, itemIndex) => itemIndex === index ? { ...item, taxCodeId: event.target.value || null } : item))}>
                      <option value="">No tax</option>
                      {taxCodes.filter((code) => code.isActive || code.id === line.taxCodeId).map((code) => <option key={code.id} value={code.id}>{code.code} {code.name}</option>)}
                    </select>
                  ) : line.taxRate}
                </td>
                <td>{line.taxAmount}</td>
                <td>{line.lineTotal}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p>Tax {invoice.taxTotal} · Total {invoice.total}</p>
        {editable ? <button className="btn" type="button" onClick={saveDraft}>Save line tax and discount</button> : null}
      </div>
      <div className="row">
        {editable ? <button className="btn" type="button" onClick={() => act("submit")}>Submit</button> : null}
        {invoice.status === "submitted" ? <button className="btn" type="button" onClick={() => act("approve")}>Approve</button> : null}
        {invoice.status === "approved" ? <button className="btn" type="button" onClick={() => act("post", {})}>Post</button> : null}
        {invoice.status === "posted" ? (
          <>
            <input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Reason" />
            <button className="btn" type="button" onClick={() => act("reverse", { reason })}>Reverse</button>
          </>
        ) : null}
      </div>
    </div>
  );
}
