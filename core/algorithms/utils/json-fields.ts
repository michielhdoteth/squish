/**
 * Tolerant readers for JSON-encoded text columns in SQLite
 * (values may be stored as JSON strings or already-parsed arrays/objects
 * depending on the write path / backend).
 */

export function asArray<T = unknown>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * Convert a timestamp cell (Date | epoch seconds | ISO string) to ISO 8601,
 * returning '' for null/invalid values instead of throwing.
 */
export function toIsoString(value: unknown): string {
  if (!value) return '';
  const date =
    value instanceof Date
      ? value
      : new Date(typeof value === 'number' ? value * 1000 : String(value));
  return isNaN(date.getTime()) ? '' : date.toISOString();
}
