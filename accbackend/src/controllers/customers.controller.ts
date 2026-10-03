import { actorFrom } from "../middleware/authenticate";
import { createCustomer, customerBalance, customerHistory, getCustomer, listCustomers, recordCustomerAtl, saveOpeningDetails, updateCustomerProfile } from "../modules/customers/customers.service";
import { atlBody, customerBody, customerListQuery, historyQuery, openingDetailBody } from "../modules/customers/customers.schemas";
import { parseBody, parseQuery, wrap } from "../shared/http";
import { toPage } from "../shared/http/pagination";

export const listCustomersController = wrap(async (req, res) => {
  const queryInput = parseQuery(customerListQuery, req.query);
  res.json(await listCustomers(toPage(queryInput), queryInput));
});

export const createCustomerController = wrap(async (req, res) => {
  res.status(201).json(await createCustomer(parseBody(customerBody, req.body), actorFrom(req)));
});

export const getCustomerController = wrap(async (req, res) => {
  res.json(await getCustomer(req.params.id));
});

export const updateCustomerController = wrap(async (req, res) => {
  res.json(await updateCustomerProfile(req.params.id, parseBody(customerBody, req.body), actorFrom(req)));
});

export const recordCustomerAtlController = wrap(async (req, res) => {
  res.json(await recordCustomerAtl(req.params.id, parseBody(atlBody, req.body), actorFrom(req)));
});

export const customerBalanceController = wrap(async (req, res) => {
  res.json(await customerBalance(req.params.id));
});

export const customerHistoryController = wrap(async (req, res) => {
  const queryInput = parseQuery(historyQuery, req.query);
  res.json(await customerHistory(req.params.id, toPage(queryInput), queryInput));
});

export const saveOpeningDetailsController = wrap(async (req, res) => {
  res.json(await saveOpeningDetails(parseBody(openingDetailBody, req.body), actorFrom(req)));
});
