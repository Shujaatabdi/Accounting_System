import { actorFrom } from "../middleware/authenticate";
import { allocatePayment, approvePayment, createPayment, getPayment, listPayments, postPayment, rejectPayment, reversePayment, submitPayment, unallocatePayment, updatePaymentDraft, voidPayment } from "../modules/supplier-payments/supplier-payments.service";
import { allocationBody, paymentBody, paymentListQuery, reasonBody } from "../modules/supplier-payments/supplier-payments.schemas";
import { parseBody, parseQuery, wrap } from "../shared/http";
import { toPage } from "../shared/http/pagination";

export const listPaymentsController = wrap(async (req, res) => {
  const queryInput = parseQuery(paymentListQuery, req.query);
  res.json(await listPayments(actorFrom(req).actor, toPage(queryInput), queryInput));
});

export const createPaymentController = wrap(async (req, res) => {
  res.status(201).json(await createPayment(parseBody(paymentBody, req.body), actorFrom(req)));
});

export const getPaymentController = wrap(async (req, res) => {
  res.json(await getPayment(req.params.id, actorFrom(req).actor));
});

export const updatePaymentController = wrap(async (req, res) => {
  res.json(await updatePaymentDraft(req.params.id, parseBody(paymentBody, req.body), actorFrom(req)));
});

export const submitPaymentController = wrap(async (req, res) => {
  res.json(await submitPayment(req.params.id, actorFrom(req)));
});

export const rejectPaymentController = wrap(async (req, res) => {
  res.json(await rejectPayment(req.params.id, parseBody(reasonBody, req.body).reason, actorFrom(req)));
});

export const approvePaymentController = wrap(async (req, res) => {
  res.json(await approvePayment(req.params.id, actorFrom(req)));
});

export const postPaymentController = wrap(async (req, res) => {
  res.json(await postPayment(req.params.id, actorFrom(req)));
});

export const allocatePaymentController = wrap(async (req, res) => {
  res.json(await allocatePayment(req.params.id, parseBody(allocationBody, req.body), actorFrom(req)));
});

export const unallocatePaymentController = wrap(async (req, res) => {
  res.json(await unallocatePayment(req.params.id, req.params.allocationId, actorFrom(req)));
});

export const voidPaymentController = wrap(async (req, res) => {
  res.json(await voidPayment(req.params.id, parseBody(reasonBody, req.body).reason, actorFrom(req)));
});

export const reversePaymentController = wrap(async (req, res) => {
  res.json(await reversePayment(req.params.id, parseBody(reasonBody, req.body), actorFrom(req)));
});
