import type { Sql } from "../../db/pool";

export async function allocateSequence(db: Sql, docType: string) {
  return db.query<{ prefix: string; allocated: number; pad_length: number }>(
    `UPDATE document_sequences
        SET next_number = next_number + 1
      WHERE doc_type = $1
      RETURNING prefix, (next_number - 1) AS allocated, pad_length`,
    [docType],
  );
}

export async function listSequenceRows(db: Sql) {
  return db.query(
    `SELECT doc_type, prefix, next_number, pad_length FROM document_sequences ORDER BY doc_type`,
  );
}

export async function lockSequence(db: Sql, docType: string) {
  return db.query(
    `SELECT doc_type, prefix, next_number, pad_length FROM document_sequences WHERE doc_type = $1 FOR UPDATE`,
    [docType],
  );
}

export async function saveSequence(db: Sql, docType: string, prefix: string, nextNumber: number, padLength: number) {
  return db.query(
    `UPDATE document_sequences
        SET prefix = $2, next_number = $3, pad_length = $4
      WHERE doc_type = $1
      RETURNING doc_type, prefix, next_number, pad_length`,
    [docType, prefix, nextNumber, padLength],
  );
}
