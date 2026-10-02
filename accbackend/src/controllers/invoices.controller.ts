import { actorFrom } from "../middleware/authenticate";
import { approveInvoice, createInvoice, getInvoice, listInvoices, postInvoice, rejectInvoice, reverseInvoice, submitInvoice, updateInvoiceDraft, voidInvoice } from "../modules/invoices/invoices.service";
import { invoiceBody, invoiceListQuery, invoicePostBody, reasonBody } from "../modules/invoices/invoices.schemas";
import { parseBody, parseQuery, wrap } from "../shared/http";
import { toPage } from "../shared/http/pagination";

export const listInvoicesController = wrap(async (req, res) => {
  const queryInput = parseQuery(invoiceListQuery, req.query);
  res.json(await listInvoices(actorFrom(req).actor, toPage(queryInput), queryInput));
});

export const createInvoiceController = wrap(async (req, res) => {
  res.status(201).json(await createInvoice(parseBody(invoiceBody, req.body), actorFrom(req)));
});

export const getInvoiceController = wrap(async (req, res) => {
  res.json(await getInvoice(req.params.id, actorFrom(req).actor));
});

export const updateInvoiceController = wrap(async (req, res) => {
  res.json(await updateInvoiceDraft(req.params.id, parseBody(invoiceBody, req.body), actorFrom(req)));
});

export const submitInvoiceController = wrap(async (req, res) => {
  res.json(await submitInvoice(req.params.id, actorFrom(req)));
});

export const rejectInvoiceController = wrap(async (req, res) => {
  res.json(await rejectInvoice(req.params.id, parseBody(reasonBody, req.body).reason, actorFrom(req)));
});

export const approveInvoiceController = wrap(async (req, res) => {
  res.json(await approveInvoice(req.params.id, actorFrom(req)));
});

export const postInvoiceController = wrap(async (req, res) => {
  res.json(await postInvoice(req.params.id, parseBody(invoicePostBody, req.body), actorFrom(req)));
});

export const voidInvoiceController = wrap(async (req, res) => {
  res.json(await voidInvoice(req.params.id, parseBody(reasonBody, req.body).reason, actorFrom(req)));
});

export const reverseInvoiceController = wrap(async (req, res) => {
  res.json(await reverseInvoice(req.params.id, parseBody(reasonBody, req.body), actorFrom(req)));
});
