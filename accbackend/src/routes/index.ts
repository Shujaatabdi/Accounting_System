import { Router } from "express";
import { accountsRouter } from "./accounts.routes";
import { authRouter } from "./auth.routes";
import { branchesRouter } from "./branches.routes";
import { companyRouter } from "./company.routes";
import { journalsRouter } from "./journals.routes";
import { periodsRouter } from "./periods.routes";
import { reportsRouter } from "./reports.routes";
import { rolesRouter } from "./roles.routes";
import { usersRouter } from "./users.routes";

export function apiRouter() {
  const router = Router();
  router.use(companyRouter);
  router.use(usersRouter);
  router.use(rolesRouter);
  router.use(branchesRouter);
  router.use(accountsRouter);
  router.use(periodsRouter);
  router.use(journalsRouter);
  router.use(reportsRouter);
  return router;
}

export { authRouter };
