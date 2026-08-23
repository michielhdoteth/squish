/**
 * SQLite busy/locked retry helper.
 *
 * Under concurrent access (multiple agent processes sharing one SQLite file)
 * writes can fail transiently with SQLITE_BUSY / SQLITE_LOCKED even with
 * WAL mode and a busy_timeout configured. This helper wraps write operations
 * with a bounded retry using short exponential backoff.
 *
 * Only busy-class errors are retried; everything else propagates immediately.
 */

import { logger } from '../core/logger.js';

export interface BusyRetryOptions {
  /** Number of retries after the initial attempt. Default: 3 */
  maxRetries?: number;
  /** Base backoff delay in ms (doubled each retry). Default: 50 */
  baseDelayMs?: number;
  /** Human-readable label for log lines. */
  label?: string;
}

const BUSY_ERROR_PATTERN = /\b(SQLITE_BUSY|SQLITE_LOCKED|database is locked|database table is locked)\b/i;

export function isSqliteBusyError(error: unknown): boolean {
  if (!error) return false;
  const code = (error as { code?: unknown }).code;
  if (code === 'SQLITE_BUSY' || code === 'SQLITE_LOCKED') return true;
  const message = error instanceof Error ? error.message : String(error);
  return BUSY_ERROR_PATTERN.test(message);
}

function backoffDelay(baseDelayMs: number, retryIndex: number): number {
  return baseDelayMs * Math.pow(2, Math.max(0, retryIndex - 1));
}

export async function withBusyRetry<T>(
  operation: () => Promise<T>,
  options: BusyRetryOptions = {}
): Promise<T> {
  const maxRetries = options.maxRetries ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 50;
  const label = options.label ?? 'sqlite-write';

  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isSqliteBusyError(error) || attempt >= maxRetries) {
        throw error;
      }
      const delay = backoffDelay(baseDelayMs, attempt + 1);
      logger.warn(
        `[busy-retry] ${label}: database busy (attempt ${attempt + 1}/${maxRetries}), retrying in ${delay}ms`,
        { error: error instanceof Error ? error.message : String(error) }
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}
