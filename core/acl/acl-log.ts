/**
 * Bounded structured log for ACL read-gate would-filter decisions.
 * In-memory ring buffer; inspect via getAclLog().
 */

export type AclLogKind = 'acl_would_filter';

export interface AclLogEntry {
  kind: AclLogKind;
  at: string;
  [key: string]: unknown;
}

const MAX_ENTRIES = 500;
const log: AclLogEntry[] = [];

export function pushAclLog(entry: Omit<AclLogEntry, 'kind' | 'at'>): void {
  if (log.length >= MAX_ENTRIES) {
    log.shift();
  }
  log.push({ kind: 'acl_would_filter', at: new Date().toISOString(), ...entry });
}

export function getAclLog(kind?: AclLogKind): AclLogEntry[] {
  return kind ? log.filter((e) => e.kind === kind) : [...log];
}

export function clearAclLog(): void {
  log.length = 0;
}
