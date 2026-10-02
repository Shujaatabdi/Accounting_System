import { actorFrom } from "../middleware/authenticate";
import { allocateReceipt, approveReceipt, createReceipt, getReceipt, listReceipts, postReceipt, rejectReceipt, reverseReceipt, submitReceipt, unallocateReceipt, updateReceiptDraft, voidReceipt } from "../modules/receipts/receipts.service";
import { allocationBody, reasonBody, receiptBody, receiptListQuery } from "../modules/receipts/receipts.schemas";
import { parseBody, parseQuery, wrap } from "../shared/http";
import { toPage } from "../shared/http/pagination";

export const listReceiptsController = wrap(async (req, res) => {
  const queryInput = parseQuery(receiptListQuery, req.query);
  res.json(await listReceipts(actorFrom(req).actor, toPage(queryInput), queryInput));
});

export const createReceiptController = wrap(async (req, res) => {
  res.status(201).json(await createReceipt(parseBody(receiptBody, req.body), actorFrom(req)));
});

export const getReceiptController = wrap(async (req, res) => {
  res.json(await getReceipt(req.params.id, actorFrom(req).actor));
});

export const updateReceiptController = wrap(async (req, res) => {
  res.json(await updateReceiptDraft(req.params.id, parseBody(receiptBody, req.body), actorFrom(req)));
});

export const submitReceiptController = wrap(async (req, res) => {
  res.json(await submitReceipt(req.params.id, actorFrom(req)));
});

export const rejectReceiptController = wrap(async (req, res) => {
  res.json(await rejectReceipt(req.params.id, parseBody(reasonBody, req.body).reason, actorFrom(req)));
});

export const approveReceiptController = wrap(async (req, res) => {
  res.json(await approveReceipt(req.params.id, actorFrom(req)));
});

export const postReceiptController = wrap(async (req, res) => {
  res.json(await postReceipt(req.params.id, actorFrom(req)));
});

export const allocateReceiptController = wrap(async (req, res) => {
  res.json(await allocateReceipt(req.params.id, parseBody(allocationBody, req.body), actorFrom(req)));
});

export const unallocateReceiptController = wrap(async (req, res) => {
  res.json(await unallocateReceipt(req.params.id, req.params.allocationId, actorFrom(req)));
});

export const voidReceiptController = wrap(async (req, res) => {
  res.json(await voidReceipt(req.params.id, parseBody(reasonBody, req.body).reason, actorFrom(req)));
});

export const reverseReceiptController = wrap(async (req, res) => {
  res.json(await reverseReceipt(req.params.id, parseBody(reasonBody, req.body), actorFrom(req)));
});
