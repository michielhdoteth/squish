import { config } from '../../config.js';

export function normalizeTags(tags?: string[]): string[] {
  return (tags || []).map((tag) => tag.trim()).filter((tag) => tag.length > 0);
}

export function toSqliteJson(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  return JSON.stringify(value);
}

export function fromSqliteJson<T>(value: string | null | undefined): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

export function toSqliteTags(tags?: string[]): string | null {
  if (!tags || tags.length === 0) return null;
  return JSON.stringify(tags);
}

export function fromSqliteTags(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return value.split(',').map((tag) => tag.trim()).filter(Boolean);
  }
}

// High-level helpers that abstract away team mode vs local mode

export function serializeTags(tags?: string[]): string[] | string | null | undefined {
  if (config.isTeamMode) {
    // PostgreSQL: store as array directly (or null if empty)
    return tags && tags.length > 0 ? tags : null;
  } else {
    // SQLite: store as JSON string (or null)
    return toSqliteTags(tags);
  }
}

export function deserializeTags(value: string[] | string | null | undefined): string[] {
  if (config.isTeamMode) {
    // PostgreSQL: value is already an array or null/undefined
    return Array.isArray(value) ? value : [];
  } else {
    // SQLite: value is a JSON string or null/undefined
    if (typeof value === 'string' || value === null || value === undefined) {
      return fromSqliteTags(value);
    }
    // Unexpected type, return empty array
    return [];
  }
}

export function serializeMetadata(metadata: Record<string, unknown> | null | undefined): Record<string, unknown> | string | null {
  if (config.isTeamMode) {
    // PostgreSQL: store object directly (or null if null/undefined, keep empty object as-is)
    return metadata === undefined || metadata === null ? null : metadata;
  } else {
    // SQLite: store as JSON string (or null)
    return toSqliteJson(metadata);
  }
}

export function deserializeMetadata(value: Record<string, unknown> | string | null | undefined): Record<string, unknown> | null {
  if (config.isTeamMode) {
    // PostgreSQL: value is already an object or null/undefined
    return value == null ? null : (value as Record<string, unknown>);
  } else {
    // SQLite: value is a JSON string or null/undefined
    if (typeof value === 'string' || value === null) {
      return fromSqliteJson<Record<string, unknown>>(value);
    }
    return null;
  }
}
