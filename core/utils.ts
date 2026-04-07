/**
 * Shared utility functions for the squish codebase
 */

import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { config } from '../config.js';
import { toSqliteJson } from './memory/serialization.js';

export function normalizeTimestamp(value: any): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'number') {
    try {
      // Handle different timestamp formats using magnitude thresholds
      // Microseconds: > 100000000000000 (e.g., 1700000000000000)
      // Milliseconds: > 1000000000000 (e.g., 1700000000000)
      // Seconds: <= 1000000000000 (e.g., 1700000000)
      if (value > 100000000000000) {
        return new Date(value / 1000).toISOString();
      } else if (value > 1000000000000) {
        return new Date(value).toISOString();
      } else if (value >= 0) {
        return new Date(value * 1000).toISOString();
      }
      return null;
    } catch {
      return null;
    }
  }
  if (typeof value === 'string') {
    try {
      const parsed = new Date(value);
      if (!isNaN(parsed.getTime())) return parsed.toISOString();
      return null;
    } catch {
      return null;
    }
  }
  return null;
}

export function now(): string {
  return new Date().toISOString();
}

export function isDatabaseUnavailableError(error: any): boolean {
  const message = error?.message || '';
  return [
    'Database unavailable',
    'not a valid Win32 application',
    'invalid ELF header',
    'bun:',
    'sql.js wasm asset not found',
    'SQLite database initialization failed',
    'working local SQLite driver',
  ].some((pattern) => message.includes(pattern));
}

export async function withDatabaseErrorHandling<T>(
  operation: () => Promise<T>,
  errorMessage: string
): Promise<T> {
  try {
    return await operation();
  } catch (dbError: any) {
    if (isDatabaseUnavailableError(dbError)) {
      throw new McpError(ErrorCode.InternalError, errorMessage);
    }
    throw dbError;
  }
}

export function clampLimit(value: number | undefined, defaultValue: number, min: number = 1, max: number = 100): number {
  return Math.min(Math.max(value ?? defaultValue, min), max);
}

export function prepareEmbedding(embedding: number[] | null): { embedding?: number[] | null; embeddingJson?: string | null } {
  if (config.isTeamMode) {
    return { embedding: embedding ?? null };
  }
  return { embeddingJson: toSqliteJson(embedding ?? null) };
}

export function determineOverallStatus(dbStatus: string, redisOk: boolean): string {
  if ((dbStatus === 'ok' || dbStatus === 'unavailable') && redisOk) {
    return 'ok';
  }
  if (dbStatus === 'unavailable') {
    return 'degraded';
  }
  return 'error';
}
