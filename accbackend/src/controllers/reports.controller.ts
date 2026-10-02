import type { Response } from "express";
import { actorFrom } from "../middleware/authenticate";
import { balanceSheet, generalLedger, getDashboard, journalReport, profitAndLoss, trialBalance } from "../modules/reports/reports.service";
import { reportQuery } from "../modules/reports/reports.schemas";
import { AppError } from "../shared/errors";
import { parseQuery, wrap } from "../shared/http";
import { toCsv } from "../shared/http/csv";

export const dashboardController = wrap(async (req, res) => {
  res.json(await getDashboard(actorFrom(req).actor));
});

export const trialBalanceController = wrap(async (req, res) => {
  const filters = parseQuery(reportQuery, req.query);
  const report = await trialBalance(actorFrom(req).actor, filters);
  if (!wantsCsv(req)) return res.json(report);
  sendCsv(res, "trial-balance.csv", ["Code", "Name", "Type", "Debit", "Credit"], report.rows.map((row) => [
    row.code, row.name, row.accountType, row.debitBalance, row.creditBalance,
  ]));
});

export const profitAndLossController = wrap(async (req, res) => {
  const filters = parseQuery(reportQuery, req.query);
  const report = await profitAndLoss(actorFrom(req).actor, filters);
  if (!wantsCsv(req)) return res.json(report);
  sendCsv(res, "profit-and-loss.csv", ["Code", "Name", "Type", "Amount"], report.rows.map((row) => [
    row.code, row.name, row.accountType, row.amount,
  ]));
});

export const balanceSheetController = wrap(async (req, res) => {
  const filters = parseQuery(reportQuery, req.query);
  const report = await balanceSheet(actorFrom(req).actor, filters);
  if (!wantsCsv(req)) return res.json(report);
  const rows = [
    ...report.assets.map((row) => ["asset", row.code, row.name, row.amount]),
    ...report.liabilities.map((row) => ["liability", row.code, row.name, row.amount]),
    ...report.equity.map((row) => ["equity", row.code, row.name, row.amount]),
    ["equity", "", "Unclosed profit or loss", report.unclosedProfitOrLoss],
  ];
  sendCsv(res, "balance-sheet.csv", ["Section", "Code", "Name", "Amount"], rows);
});

export const generalLedgerController = wrap(async (req, res) => {
  const filters = parseQuery(reportQuery, req.query);
  const report = await generalLedger(actorFrom(req).actor, filters);
  if (!wantsCsv(req)) return res.json(report);
  sendCsv(res, "general-ledger.csv", ["Entry", "Transaction date", "Posting date", "Description", "Debit", "Credit", "Balance"], report.lines.map((line) => [
    line.entryNumber, line.entryDate, line.postingDate, line.description ?? "", line.debit, line.credit, line.runningBalance,
  ]));
});

export const journalReportController = wrap(async (req, res) => {
  const filters = parseQuery(reportQuery, req.query);
  const report = await journalReport(actorFrom(req).actor, filters);
  if (!wantsCsv(req)) return res.json(report);
  sendCsv(res, "journals.csv", ["Entry", "Transaction date", "Posting date", "Account", "Debit", "Credit", "Description"], report.rows.map((row) => [
    row.entryNumber, row.entryDate, row.postingDate, row.accountCode, row.debit, row.credit, row.lineDescription ?? row.description,
  ]));
});

function wantsCsv(req: { query: unknown; user?: { isCompanyAdmin: boolean; permissions: string[] } }) {
  const format = typeof req.query === "object" && req.query && "format" in req.query ? req.query.format : undefined;
  if (format !== "csv") return false;
  const user = req.user;
  if (!user?.isCompanyAdmin && !user?.permissions.includes("reports.export")) {
    throw new AppError(403, "FORBIDDEN", "You do not have permission to export reports.");
  }
  return true;
}

function sendCsv(res: Response, filename: string, headers: string[], rows: string[][]) {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(toCsv(headers, rows));
}
