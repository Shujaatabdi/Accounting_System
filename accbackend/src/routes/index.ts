import { Router } from "express";
import { accountsRouter } from "./accounts.routes";
import { authRouter } from "./auth.routes";
import { branchesRouter } from "./branches.routes";
import { companyRouter } from "./company.routes";
import { customerReturnsRouter } from "./customer-returns.routes";
import { customersRouter } from "./customers.routes";
import { invoicesRouter } from "./invoices.routes";
import { journalsRouter } from "./journals.routes";
import { productsRouter } from "./products.routes";
import { receiptsRouter } from "./receipts.routes";
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
  router.use(customersRouter);
  router.use(productsRouter);
  router.use(invoicesRouter);
  router.use(receiptsRouter);
  router.use(customerReturnsRouter);
  router.use(reportsRouter);
  return router;
}

export { authRouter };
