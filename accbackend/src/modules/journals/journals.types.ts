import type { DraftLineInput } from "./journals.validation";

export type JournalInput = {
  entryDate: string;
  description: string;
  reference?: string | null;
  sourceType?: "manual" | "opening_balance";
  lines: DraftLineInput[];
};
