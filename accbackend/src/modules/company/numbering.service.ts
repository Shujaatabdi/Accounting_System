import { query, type Sql } from "../../db/pool";
import { withTransaction } from "../../db/transaction";
import { writeAudit } from "../../shared/audit";
import { AppError, one } from "../../shared/errors";
import type { RequestMeta } from "../auth/auth.types";
import { allocateSequence, listSequenceRows, lockSequence, saveSequence } from "./numbering.repository";

const DOC_TYPES = new Set(["journal"]);

export async function allocateNumber(db: Sql, docType: string): Promise<string> {
  const result = await allocateSequence(db, docType);
  const row = result.rows[0];
  if (!row) throw new AppError(500, "NUMBERING", `No document sequence exists for ${docType}.`);
  return `${row.prefix}${String(row.allocated).padStart(row.pad_length, "0")}`;
}

export async function listSequences() {
  const result = await listSequenceRows({ query });
  return result.rows.map(mapSequence);
}

export async function updateSequence(
  docType: string,
  input: { prefix: string; nextNumber: number; padLength: number },
  meta: RequestMeta,
) {
  if (!DOC_TYPES.has(docType)) throw new AppError(404, "NOT_FOUND", "Unknown document type.");
  if (!Number.isInteger(input.nextNumber) || input.nextNumber < 1) {
    throw new AppError(400, "VALIDATION", "The next number must be a positive integer.");
  }
  return withTransaction(async (client) => {
    const current = one(
      (await lockSequence(client, docType)).rows,
      "Unknown document type.",
    ) as { doc_type: string; prefix: string; next_number: number; pad_length: number };
    if (input.nextNumber < current.next_number) {
      throw new AppError(400, "VALIDATION", "The next number cannot reuse a number that was already issued.");
    }
    const updated = one(
      (await saveSequence(client, docType, input.prefix, input.nextNumber, input.padLength)).rows,
    ) as typeof current;
    await writeAudit(client, {
      actorUserId: meta.actor.id,
      action: "numbering.update",
      entityType: "document_sequence",
      entityId: docType,
      summary: `Updated ${docType} numbering`,
      before: mapSequence(current),
      after: mapSequence(updated),
      ipAddress: meta.ipAddress,
      requestId: meta.requestId,
    });
    return mapSequence(updated);
  });
}

function mapSequence(row: { doc_type: string; prefix: string; next_number: number; pad_length: number }) {
  return {
    docType: row.doc_type,
    prefix: row.prefix,
    nextNumber: row.next_number,
    padLength: row.pad_length,
  };
}
