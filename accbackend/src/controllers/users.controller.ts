import { actorFrom } from "../middleware/authenticate";
import { createUser, listAudit, listUsers, updateUser } from "../modules/users/users.service";
import { auditListQuery, userBody, userListQuery } from "../modules/users/users.schemas";
import { parseBody, parseQuery, wrap } from "../shared/http";
import { toPage } from "../shared/http/pagination";

export const listUsersController = wrap(async (req, res) => {
  const queryInput = parseQuery(userListQuery, req.query);
  res.json(await listUsers(toPage(queryInput), queryInput.search));
});

export const createUserController = wrap(async (req, res) => {
  res.status(201).json(await createUser(parseBody(userBody, req.body), actorFrom(req)));
});

export const updateUserController = wrap(async (req, res) => {
  res.json(await updateUser(req.params.id, parseBody(userBody, req.body), actorFrom(req)));
});

export const listAuditController = wrap(async (req, res) => {
  const queryInput = parseQuery(auditListQuery, req.query);
  res.json(await listAudit(toPage(queryInput), queryInput));
});
