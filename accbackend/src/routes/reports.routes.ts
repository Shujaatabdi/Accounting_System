import { Router } from "express";
import {
  balanceSheetController,
  dashboardController,
  generalLedgerController,
  customerStatementController,
  journalReportController,
  profitAndLossController,
  payablesAgingController,
  purchasesReportController,
  receivablesAgingController,
  salesReportController,
  supplierReturnsReportController,
  supplierStatementController,
  trialBalanceController,
} from "../controllers/reports.controller";
import { requirePermission } from "../middleware/authorize";

export const reportsRouter = Router();
reportsRouter.get("/dashboard", dashboardController);
reportsRouter.get("/reports/trial-balance", requirePermission("reports.view"), trialBalanceController);
reportsRouter.get("/reports/profit-and-loss", requirePermission("reports.view"), profitAndLossController);
reportsRouter.get("/reports/balance-sheet", requirePermission("reports.view"), balanceSheetController);
reportsRouter.get("/reports/general-ledger", requirePermission("reports.view"), generalLedgerController);
reportsRouter.get("/reports/journals", requirePermission("reports.view"), journalReportController);
reportsRouter.get("/reports/receivables-aging", requirePermission("reports.view"), receivablesAgingController);
reportsRouter.get("/reports/customer-statement", requirePermission("reports.view"), customerStatementController);
reportsRouter.get("/reports/sales", requirePermission("reports.view"), salesReportController);
reportsRouter.get("/reports/payables-aging", requirePermission("reports.view"), payablesAgingController);
reportsRouter.get("/reports/supplier-statement", requirePermission("reports.view"), supplierStatementController);
reportsRouter.get("/reports/purchases", requirePermission("reports.view"), purchasesReportController);
reportsRouter.get("/reports/supplier-returns", requirePermission("reports.view"), supplierReturnsReportController);
