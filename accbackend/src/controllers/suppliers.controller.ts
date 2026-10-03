import { actorFrom } from "../middleware/authenticate";
import { createSupplier, getSupplier, listSuppliers, recordSupplierAtl, saveOpeningDetails, supplierBalance, supplierHistory, supplierProducts, updateSupplierProfile } from "../modules/suppliers/suppliers.service";
import { atlBody, historyQuery, openingDetailBody, supplierBody, supplierListQuery } from "../modules/suppliers/suppliers.schemas";
import { parseBody, parseQuery, wrap } from "../shared/http";
import { toPage } from "../shared/http/pagination";

export const listSuppliersController = wrap(async (req, res) => {
  const queryInput = parseQuery(supplierListQuery, req.query);
  res.json(await listSuppliers(toPage(queryInput), queryInput));
});

export const createSupplierController = wrap(async (req, res) => {
  res.status(201).json(await createSupplier(parseBody(supplierBody, req.body), actorFrom(req)));
});

export const getSupplierController = wrap(async (req, res) => {
  res.json(await getSupplier(req.params.id));
});

export const updateSupplierController = wrap(async (req, res) => {
  res.json(await updateSupplierProfile(req.params.id, parseBody(supplierBody, req.body), actorFrom(req)));
});

export const recordSupplierAtlController = wrap(async (req, res) => {
  res.json(await recordSupplierAtl(req.params.id, parseBody(atlBody, req.body), actorFrom(req)));
});

export const supplierBalanceController = wrap(async (req, res) => {
  res.json(await supplierBalance(req.params.id));
});

export const supplierHistoryController = wrap(async (req, res) => {
  const queryInput = parseQuery(historyQuery, req.query);
  res.json(await supplierHistory(req.params.id, toPage(queryInput), queryInput));
});

export const supplierProductsController = wrap(async (req, res) => {
  res.json({ data: await supplierProducts(req.params.id) });
});

export const saveSupplierOpeningDetailsController = wrap(async (req, res) => {
  res.json(await saveOpeningDetails(parseBody(openingDetailBody, req.body), actorFrom(req)));
});
