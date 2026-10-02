import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const fiscalYearBody = z.object({ startDate: isoDate });
export const reasonBody = z.object({ reason: z.string().trim().min(3).max(500) });
