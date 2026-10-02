import { actorFrom } from "../middleware/authenticate";
import {
  approveJournal,
  createJournal,
  getJournal,
  listJournals,
  postJournal,
  rejectJournal,
  reverseJournal,
  submitJournal,
  updateJournal,
  voidJournal,
} from "../modules/journals/journals.service";
import { journalBody, journalListQuery, postBody, reasonBody, reverseBody } from "../modules/journals/journals.schemas";
import { parseBody, parseQuery, wrap } from "../shared/http";
import { toPage } from "../shared/http/pagination";

export const listJournalsController = wrap(async (req, res) => {
  const queryInput = parseQuery(journalListQuery, req.query);
  res.json(await listJournals(actorFrom(req).actor, toPage(queryInput), queryInput));
});

export const createJournalController = wrap(async (req, res) => {
  res.status(201).json(await createJournal(parseBody(journalBody, req.body), actorFrom(req)));
});

export const getJournalController = wrap(async (req, res) => {
  res.json(await getJournal(req.params.id, actorFrom(req).actor));
});

export const updateJournalController = wrap(async (req, res) => {
  res.json(await updateJournal(req.params.id, parseBody(journalBody, req.body), actorFrom(req)));
});

export const submitJournalController = wrap(async (req, res) => {
  res.json(await submitJournal(req.params.id, actorFrom(req)));
});

export const rejectJournalController = wrap(async (req, res) => {
  const body = parseBody(reasonBody, req.body);
  res.json(await rejectJournal(req.params.id, body.reason, actorFrom(req)));
});

export const approveJournalController = wrap(async (req, res) => {
  res.json(await approveJournal(req.params.id, actorFrom(req)));
});

export const postJournalController = wrap(async (req, res) => {
  const body = parseBody(postBody, req.body ?? {});
  res.json(await postJournal(req.params.id, body.postingDate, actorFrom(req)));
});

export const voidJournalController = wrap(async (req, res) => {
  const body = parseBody(reasonBody, req.body);
  res.json(await voidJournal(req.params.id, body.reason, actorFrom(req)));
});

export const reverseJournalController = wrap(async (req, res) => {
  res.json(await reverseJournal(req.params.id, parseBody(reverseBody, req.body), actorFrom(req)));
});
