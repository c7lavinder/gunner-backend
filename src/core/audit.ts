/**
 * Audit log — every agent action recorded here.
 * Append-only. Used by the API to power the auditor UI.
 */

export interface AuditEntry {
  id: string;
  timestamp: number;
  agent: string;
  contactId: string;
  opportunityId?: string;
  action: string;
  result: string;
  reason?: string;
  durationMs?: number;
  metadata?: Record<string, unknown>;
}

const log: AuditEntry[] = [];
let seq = 0;

export function auditLog(entry: Omit<AuditEntry, 'id' | 'timestamp'>) {
  log.push({
    id: `${Date.now()}-${++seq}`,
    timestamp: Date.now(),
    ...entry,
  });
  // Keep last 5000 entries in memory
  if (log.length > 5000) log.splice(0, log.length - 5000);
}

export function getAuditLog(limit = 500): AuditEntry[] {
  return log.slice(-limit).reverse();
}

export function getAuditForContact(contactId: string): AuditEntry[] {
  return log.filter((e) => e.contactId === contactId).reverse();
}
