import type { Sql } from "../../db/pool";
import { query, withTransaction } from "../../db/pool";
import { writeAudit } from "../../lib/audit";
import { AppError, one } from "../../lib/errors";
import type { RequestMeta } from "../auth/types";

const DOC_TYPES = new Set(["journal"]);

export async function allocateNumber(db: Sql, docType: string): Promise<string> {
  const result = await db.query<{ prefix: string; allocated: number; pad_length: number }>(
    `UPDATE document_sequences
        SET next_number = next_number + 1
      WHERE doc_type = $1
      RETURNING prefix, (next_number - 1) AS allocated, pad_length`,
    [docType],
  );
  const row = result.rows[0];
  if (!row) throw new AppError(500, "NUMBERING", `No document sequence exists for ${docType}.`);
  return `${row.prefix}${String(row.allocated).padStart(row.pad_length, "0")}`;
}

export async function listSequences() {
  const result = await query(
    `SELECT doc_type, prefix, next_number, pad_length FROM document_sequences ORDER BY doc_type`,
  );
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
      (await client.query(`SELECT doc_type, prefix, next_number, pad_length FROM document_sequences WHERE doc_type = $1 FOR UPDATE`, [docType])).rows,
      "Unknown document type.",
    ) as { doc_type: string; prefix: string; next_number: number; pad_length: number };
    if (input.nextNumber < current.next_number) {
      throw new AppError(400, "VALIDATION", "The next number cannot reuse a number that was already issued.");
    }
    const updated = one(
      (
        await client.query(
          `UPDATE document_sequences
              SET prefix = $2, next_number = $3, pad_length = $4
            WHERE doc_type = $1
            RETURNING doc_type, prefix, next_number, pad_length`,
          [docType, input.prefix, input.nextNumber, input.padLength],
        )
      ).rows,
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
