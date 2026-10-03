import { actorFrom } from "../middleware/authenticate";
import { approveReturn, createReturn, getReturn, listReturns, postReturn, rejectReturn, reverseReturn, submitReturn, updateReturnDraft, voidReturn } from "../modules/supplier-returns/supplier-returns.service";
import { reasonBody, returnBody, returnListQuery } from "../modules/supplier-returns/supplier-returns.schemas";
import { parseBody, parseQuery, wrap } from "../shared/http";
import { toPage } from "../shared/http/pagination";

export const listSupplierReturnsController = wrap(async (req, res) => {
  const queryInput = parseQuery(returnListQuery, req.query);
  res.json(await listReturns(actorFrom(req).actor, toPage(queryInput), queryInput));
});

export const createSupplierReturnController = wrap(async (req, res) => {
  res.status(201).json(await createReturn(parseBody(returnBody, req.body), actorFrom(req)));
});

export const getSupplierReturnController = wrap(async (req, res) => {
  res.json(await getReturn(req.params.id, actorFrom(req).actor));
});

export const updateSupplierReturnController = wrap(async (req, res) => {
  res.json(await updateReturnDraft(req.params.id, parseBody(returnBody, req.body), actorFrom(req)));
});

export const submitSupplierReturnController = wrap(async (req, res) => {
  res.json(await submitReturn(req.params.id, actorFrom(req)));
});

export const rejectSupplierReturnController = wrap(async (req, res) => {
  res.json(await rejectReturn(req.params.id, parseBody(reasonBody, req.body).reason, actorFrom(req)));
});

export const approveSupplierReturnController = wrap(async (req, res) => {
  res.json(await approveReturn(req.params.id, actorFrom(req)));
});

export const postSupplierReturnController = wrap(async (req, res) => {
  res.json(await postReturn(req.params.id, actorFrom(req)));
});

export const voidSupplierReturnController = wrap(async (req, res) => {
  res.json(await voidReturn(req.params.id, parseBody(reasonBody, req.body).reason, actorFrom(req)));
});

export const reverseSupplierReturnController = wrap(async (req, res) => {
  res.json(await reverseReturn(req.params.id, parseBody(reasonBody, req.body), actorFrom(req)));
});
