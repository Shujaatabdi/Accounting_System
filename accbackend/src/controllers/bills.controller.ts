import { actorFrom } from "../middleware/authenticate";
import { approveBill, createBill, getBill, listBills, postBill, rejectBill, reverseBill, submitBill, updateBillDraft, voidBill } from "../modules/bills/bills.service";
import { billBody, billListQuery, billPostBody, reasonBody } from "../modules/bills/bills.schemas";
import { parseBody, parseQuery, wrap } from "../shared/http";
import { toPage } from "../shared/http/pagination";

export const listBillsController = wrap(async (req, res) => {
  const queryInput = parseQuery(billListQuery, req.query);
  res.json(await listBills(actorFrom(req).actor, toPage(queryInput), queryInput));
});

export const createBillController = wrap(async (req, res) => {
  res.status(201).json(await createBill(parseBody(billBody, req.body), actorFrom(req)));
});

export const getBillController = wrap(async (req, res) => {
  res.json(await getBill(req.params.id, actorFrom(req).actor));
});

export const updateBillController = wrap(async (req, res) => {
  res.json(await updateBillDraft(req.params.id, parseBody(billBody, req.body), actorFrom(req)));
});

export const submitBillController = wrap(async (req, res) => {
  res.json(await submitBill(req.params.id, actorFrom(req)));
});

export const rejectBillController = wrap(async (req, res) => {
  res.json(await rejectBill(req.params.id, parseBody(reasonBody, req.body).reason, actorFrom(req)));
});

export const approveBillController = wrap(async (req, res) => {
  res.json(await approveBill(req.params.id, actorFrom(req)));
});

export const postBillController = wrap(async (req, res) => {
  res.json(await postBill(req.params.id, parseBody(billPostBody, req.body), actorFrom(req)));
});

export const voidBillController = wrap(async (req, res) => {
  res.json(await voidBill(req.params.id, parseBody(reasonBody, req.body).reason, actorFrom(req)));
});

export const reverseBillController = wrap(async (req, res) => {
  res.json(await reverseBill(req.params.id, parseBody(reasonBody, req.body), actorFrom(req)));
});
