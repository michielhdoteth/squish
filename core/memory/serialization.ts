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

// High-level helpers - always use SQLite serialization

export function serializeTags(tags?: string[]): string | null {
  const normalized = normalizeTags(tags);
  return toSqliteTags(normalized.length > 0 ? normalized : undefined);
}

export function deserializeTags(value: string | string[] | null | undefined): string[] {
  if (Array.isArray(value)) {
    return value.map(String).filter((tag) => tag.length > 0);
  }
  return fromSqliteTags(value);
}

export function serializeMetadata(metadata: Record<string, unknown> | null | undefined): string | null {
  return toSqliteJson(metadata);
}

export function deserializeMetadata(value: string | Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value === 'string' || value === null) {
    return fromSqliteJson<Record<string, unknown>>(value);
  }
  return null;
}
