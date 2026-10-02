import { actorFrom } from "../middleware/authenticate";
import { createRole, listPermissionCatalog, listRoles, updateRole } from "../modules/roles/roles.service";
import { roleCreateBody, roleUpdateBody } from "../modules/roles/roles.schemas";
import { parseBody, wrap } from "../shared/http";

export const listPermissionsController = wrap(async (_req, res) => {
  res.json({ data: await listPermissionCatalog() });
});

export const listRolesController = wrap(async (_req, res) => {
  res.json({ data: await listRoles() });
});

export const createRoleController = wrap(async (req, res) => {
  res.status(201).json(await createRole(parseBody(roleCreateBody, req.body), actorFrom(req)));
});

export const updateRoleController = wrap(async (req, res) => {
  res.json(await updateRole(req.params.id, parseBody(roleUpdateBody, req.body), actorFrom(req)));
});
