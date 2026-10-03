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
type TaxDetails = { taxCountryCode: string | null; taxIdentifier: string | null; partyType: string | null; cnicNtn: string | null; strn: string | null } | null;
type Bill = {
  id: string;
  billNumber: string;
  supplierId: string;
  supplierName: string;
  branchId: string;
  status: string;
  billDate: string;
  dueDate: string;
  paymentTermsDays: number;
  notes: string | null;
  total: string;
  taxTotal: string;
  lines: Line[];
  supplierTaxIdentifiers: TaxDetails;
};
type TaxCode = { id: string; code: string; name: string; isActive: boolean };
const partyLabel: Record<string, string> = { individual: "Individual", company: "Company", aop: "AOP" };

export default function BillDetailScreen({ id }: { id: string }) {
  const [bill, setBill] = useState<Bill | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [taxCodes, setTaxCodes] = useState<TaxCode[]>([]);
  const [error, setError] = useState("");
  const [reason, setReason] = useState("");

  async function load() {
    const current = await api<Bill>(`/api/v1/bills/${id}`);
    setBill(current);
    setLines(current.lines);
  }
  useEffect(() => {
    load().catch((caught: Error) => setError(caught.message));
    api<{ data: TaxCode[] }>("/api/v1/tax-codes").then((result) => setTaxCodes(result.data)).catch(() => setTaxCodes([]));
  }, [id]);

  async function act(path: string, body?: unknown) {
    setError("");
    try {
      const current = await api<Bill>(`/api/v1/bills/${id}/${path}`, { method: "POST", body: JSON.stringify(body ?? {}) });
      setBill(current);
      setLines(current.lines);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The bill action failed.");
    }
  }

  async function saveDraft() {
    if (!bill) return;
    setError("");
    try {
      const current = await api<Bill>(`/api/v1/bills/${id}`, {
        method: "PUT",
        body: JSON.stringify({
          supplierId: bill.supplierId,
          branchId: bill.branchId,
          billDate: bill.billDate,
          dueDate: bill.dueDate,
          paymentTermsDays: bill.paymentTermsDays,
          notes: bill.notes,
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
      setBill(current);
      setLines(current.lines);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save the draft.");
    }
  }

  if (!bill) return <p>{error || "Loading…"}</p>;
  const editable = bill.status === "draft" || bill.status === "rejected";
  const details = bill.supplierTaxIdentifiers;
  return (
    <div>
      <h1 className="page-title">{bill.billNumber}</h1>
      <p className="lede">{bill.supplierName} · {bill.billDate} · due {bill.dueDate} · {bill.status}</p>
      {error ? <div className="banner error">{error}</div> : null}
      {details ? (
        <div className="card">
          <h2>Supplier tax details</h2>
          <p>These are the details copied when the bill was posted. They are not claimed to be legally required.</p>
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
                <td>{editable ? <input value={line.discountAmount} onChange={(event) => setLines(lines.map((item, itemIndex) => itemIndex === index ? { ...item, discountAmount: event.target.value } : item))} /> : line.discountAmount}</td>
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
        <p>Tax {bill.taxTotal} · Total {bill.total}</p>
        {editable ? <button className="btn" type="button" onClick={saveDraft}>Save line tax and discount</button> : null}
      </div>
      <div className="row">
        {editable ? <button className="btn" type="button" onClick={() => act("submit")}>Submit</button> : null}
        {bill.status === "submitted" ? <button className="btn" type="button" onClick={() => act("approve")}>Approve</button> : null}
        {bill.status === "approved" ? <button className="btn" type="button" onClick={() => act("post", {})}>Post</button> : null}
        {bill.status === "posted" ? (
          <>
            <input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Reason" />
            <button className="btn" type="button" onClick={() => act("reverse", { reason })}>Reverse</button>
          </>
        ) : null}
      </div>
    </div>
  );
}
