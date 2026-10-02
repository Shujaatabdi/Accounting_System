import { actorFrom } from "../middleware/authenticate";
import { closePeriod, closeYear, createFiscalYear, listFiscalYears, reopenPeriod, reopenYear } from "../modules/periods/periods.service";
import { fiscalYearBody, reasonBody } from "../modules/periods/periods.schemas";
import { parseBody, wrap } from "../shared/http";

export const listFiscalYearsController = wrap(async (_req, res) => {
  res.json({ data: await listFiscalYears() });
});

export const createFiscalYearController = wrap(async (req, res) => {
  const body = parseBody(fiscalYearBody, req.body);
  res.status(201).json(await createFiscalYear(body.startDate, actorFrom(req)));
});

export const closeYearController = wrap(async (req, res) => {
  const body = parseBody(reasonBody, req.body);
  res.json(await closeYear(req.params.id, body.reason, actorFrom(req)));
});

export const reopenYearController = wrap(async (req, res) => {
  const body = parseBody(reasonBody, req.body);
  res.json(await reopenYear(req.params.id, body.reason, actorFrom(req)));
});

export const closePeriodController = wrap(async (req, res) => {
  const body = parseBody(reasonBody, req.body);
  res.json(await closePeriod(req.params.id, body.reason, actorFrom(req)));
});

export const reopenPeriodController = wrap(async (req, res) => {
  const body = parseBody(reasonBody, req.body);
  res.json(await reopenPeriod(req.params.id, body.reason, actorFrom(req)));
});
