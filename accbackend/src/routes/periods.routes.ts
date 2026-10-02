import { Router } from "express";
import {
  closePeriodController,
  closeYearController,
  createFiscalYearController,
  listFiscalYearsController,
  reopenPeriodController,
  reopenYearController,
} from "../controllers/periods.controller";
import { requirePermission } from "../middleware/authorize";

export const periodsRouter = Router();
periodsRouter.get("/fiscal-years", requirePermission("periods.view"), listFiscalYearsController);
periodsRouter.post("/fiscal-years", requirePermission("periods.manage"), createFiscalYearController);
periodsRouter.post("/fiscal-years/:id/close", requirePermission("periods.close"), closeYearController);
periodsRouter.post("/fiscal-years/:id/reopen", requirePermission("periods.reopen"), reopenYearController);
periodsRouter.post("/fiscal-periods/:id/close", requirePermission("periods.close"), closePeriodController);
periodsRouter.post("/fiscal-periods/:id/reopen", requirePermission("periods.reopen"), reopenPeriodController);
