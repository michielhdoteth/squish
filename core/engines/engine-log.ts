/**
 * Bounded structured log for engine shadow disagreements and ACL read-gate
 * would-filter decisions. In-memory ring buffer; inspect via getEngineLog().
 */

export type EngineLogKind =
  | 'contradiction_shadow_disagreement'
  | 'importance_shadow_disagreement'
  | 'acl_would_filter';

export interface EngineLogEntry {
  kind: EngineLogKind;
  at: string;
  [key: string]: unknown;
}

const MAX_ENTRIES = 500;
const log: EngineLogEntry[] = [];

export function pushEngineLog(kind: EngineLogKind, entry: Omit<EngineLogEntry, 'kind' | 'at'>): void {
  if (log.length >= MAX_ENTRIES) {
    log.shift();
  }
  log.push({ kind, at: new Date().toISOString(), ...entry });
}

export function getEngineLog(kind?: EngineLogKind): EngineLogEntry[] {
  return kind ? log.filter((e) => e.kind === kind) : [...log];
}

export function clearEngineLog(): void {
  log.length = 0;
}
