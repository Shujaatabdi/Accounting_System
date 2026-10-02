import { actorFrom } from "../middleware/authenticate";
import { createBranch, listBranches, updateBranch } from "../modules/branches/branches.service";
import { branchBody, branchListQuery } from "../modules/branches/branches.schemas";
import { parseBody, parseQuery, wrap } from "../shared/http";
import { toPage } from "../shared/http/pagination";

export const listBranchesController = wrap(async (req, res) => {
  const queryInput = parseQuery(branchListQuery, req.query);
  res.json(await listBranches(toPage(queryInput), queryInput.search));
});

export const createBranchController = wrap(async (req, res) => {
  res.status(201).json(await createBranch(parseBody(branchBody, req.body), actorFrom(req)));
});

export const updateBranchController = wrap(async (req, res) => {
  res.json(await updateBranch(req.params.id, parseBody(branchBody, req.body), actorFrom(req)));
});
