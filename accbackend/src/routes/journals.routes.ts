import { Router } from "express";
import {
  approveJournalController,
  createJournalController,
  getJournalController,
  listJournalsController,
  postJournalController,
  rejectJournalController,
  reverseJournalController,
  submitJournalController,
  updateJournalController,
  voidJournalController,
} from "../controllers/journals.controller";
import { requirePermission } from "../middleware/authorize";

export const journalsRouter = Router();
journalsRouter.get("/journals", requirePermission("journals.view"), listJournalsController);
journalsRouter.post("/journals", requirePermission("journals.create"), createJournalController);
journalsRouter.get("/journals/:id", requirePermission("journals.view"), getJournalController);
journalsRouter.put("/journals/:id", requirePermission("journals.update"), updateJournalController);
journalsRouter.post("/journals/:id/submit", requirePermission("journals.submit"), submitJournalController);
journalsRouter.post("/journals/:id/reject", requirePermission("journals.approve"), rejectJournalController);
journalsRouter.post("/journals/:id/approve", requirePermission("journals.approve"), approveJournalController);
journalsRouter.post("/journals/:id/post", requirePermission("journals.post"), postJournalController);
journalsRouter.post("/journals/:id/void", requirePermission("journals.void"), voidJournalController);
journalsRouter.post("/journals/:id/reverse", requirePermission("journals.reverse"), reverseJournalController);
