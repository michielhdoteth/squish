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
      const date = new Date(value);
      if (!isNaN(date.getTime())) return date.toISOString();
      const dateSec = new Date(value * 1000);
      if (!isNaN(dateSec.getTime())) return dateSec.toISOString();
      const dateMs = new Date(value / 1000);
      if (!isNaN(dateMs.getTime())) return dateMs.toISOString();
    } catch { return null; }
  }
  if (typeof value === 'string') {
    try {
      const parsed = new Date(value);
      if (!isNaN(parsed.getTime())) return parsed.toISOString();
    } catch { return value; }
    return value;
  }
  return null;
}

export function isDatabaseUnavailableError(error: any): boolean {
  return error.message?.includes('Database unavailable') ||
         error.message?.includes('not a valid Win32 application');
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
