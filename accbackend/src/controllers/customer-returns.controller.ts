import { actorFrom } from "../middleware/authenticate";
import { approveReturn, createReturn, getReturn, listReturns, postReturn, rejectReturn, reverseReturn, submitReturn, updateReturnDraft, voidReturn } from "../modules/customer-returns/customer-returns.service";
import { reasonBody, returnBody, returnListQuery } from "../modules/customer-returns/customer-returns.schemas";
import { parseBody, parseQuery, wrap } from "../shared/http";
import { toPage } from "../shared/http/pagination";

export const listReturnsController = wrap(async (req, res) => {
  const queryInput = parseQuery(returnListQuery, req.query);
  res.json(await listReturns(actorFrom(req).actor, toPage(queryInput), queryInput));
});

export const createReturnController = wrap(async (req, res) => {
  res.status(201).json(await createReturn(parseBody(returnBody, req.body), actorFrom(req)));
});

export const getReturnController = wrap(async (req, res) => {
  res.json(await getReturn(req.params.id, actorFrom(req).actor));
});

export const updateReturnController = wrap(async (req, res) => {
  res.json(await updateReturnDraft(req.params.id, parseBody(returnBody, req.body), actorFrom(req)));
});

export const submitReturnController = wrap(async (req, res) => {
  res.json(await submitReturn(req.params.id, actorFrom(req)));
});

export const rejectReturnController = wrap(async (req, res) => {
  res.json(await rejectReturn(req.params.id, parseBody(reasonBody, req.body).reason, actorFrom(req)));
});

export const approveReturnController = wrap(async (req, res) => {
  res.json(await approveReturn(req.params.id, actorFrom(req)));
});

export const postReturnController = wrap(async (req, res) => {
  res.json(await postReturn(req.params.id, actorFrom(req)));
});

export const voidReturnController = wrap(async (req, res) => {
  res.json(await voidReturn(req.params.id, parseBody(reasonBody, req.body).reason, actorFrom(req)));
});

export const reverseReturnController = wrap(async (req, res) => {
  res.json(await reverseReturn(req.params.id, parseBody(reasonBody, req.body), actorFrom(req)));
});
