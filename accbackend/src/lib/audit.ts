import type { Sql } from "../db/pool";

export type AuditEvent = {
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  summary?: string | null;
  before?: unknown;
  after?: unknown;
  ipAddress?: string | null;
  requestId?: string | null;
};

export async function writeAudit(db: Sql, event: AuditEvent): Promise<void> {
  await db.query(
    `INSERT INTO audit_log
      (actor_user_id, action, entity_type, entity_id, summary, before_data, after_data, ip_address, request_id)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9)`,
    [
      event.actorUserId,
      event.action,
      event.entityType,
      event.entityId ?? null,
      event.summary ?? null,
      event.before === undefined ? null : JSON.stringify(event.before),
      event.after === undefined ? null : JSON.stringify(event.after),
      event.ipAddress ?? null,
      event.requestId ?? null,
    ],
  );
}
