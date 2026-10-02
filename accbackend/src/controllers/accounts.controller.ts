import { actorFrom } from "../middleware/authenticate";
import { createAccount, deleteAccount, listAccounts, updateAccount } from "../modules/accounts/accounts.service";
import { accountBody, accountListQuery } from "../modules/accounts/accounts.schemas";
import { parseBody, parseQuery, wrap } from "../shared/http";
import { toPage } from "../shared/http/pagination";

export const listAccountsController = wrap(async (req, res) => {
  const queryInput = parseQuery(accountListQuery, req.query);
  res.json(await listAccounts(toPage(queryInput), queryInput.search, queryInput.postable === "true"));
});

export const createAccountController = wrap(async (req, res) => {
  res.status(201).json(await createAccount(parseBody(accountBody, req.body), actorFrom(req)));
});

export const updateAccountController = wrap(async (req, res) => {
  res.json(await updateAccount(req.params.id, parseBody(accountBody, req.body), actorFrom(req)));
});

export const deleteAccountController = wrap(async (req, res) => {
  res.json(await deleteAccount(req.params.id, actorFrom(req)));
});
