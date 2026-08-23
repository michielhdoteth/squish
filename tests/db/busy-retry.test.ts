import { describe, expect, test } from 'bun:test';
import { withBusyRetry, isSqliteBusyError } from '../../db/busy-retry.js';

function busyError(message = 'SQLITE_BUSY: database is locked'): Error {
  return new Error(message);
}

describe('isSqliteBusyError', () => {
  test('detects SQLITE_BUSY by code', () => {
    const error = new Error('boom') as Error & { code?: string };
    error.code = 'SQLITE_BUSY';
    expect(isSqliteBusyError(error)).toBe(true);
  });

  test('detects SQLITE_LOCKED by code', () => {
    const error = new Error('boom') as Error & { code?: string };
    error.code = 'SQLITE_LOCKED';
    expect(isSqliteBusyError(error)).toBe(true);
  });

  test('detects busy errors by message text', () => {
    expect(isSqliteBusyError(new Error('database is locked'))).toBe(true);
    expect(isSqliteBusyError(new Error('database table is locked'))).toBe(true);
  });

  test('rejects non-busy errors', () => {
    expect(isSqliteBusyError(new Error('UNIQUE constraint failed'))).toBe(false);
    expect(isSqliteBusyError(null)).toBe(false);
    expect(isSqliteBusyError(undefined)).toBe(false);
  });
});

describe('withBusyRetry', () => {
  test('returns immediately when the operation succeeds', async () => {
    let attempts = 0;
    const result = await withBusyRetry(
      async () => {
        attempts++;
        return 'ok';
      },
      { baseDelayMs: 1 }
    );
    expect(result).toBe('ok');
    expect(attempts).toBe(1);
  });

  test('retries on busy errors up to maxRetries then succeeds', async () => {
    let attempts = 0;
    const result = await withBusyRetry(
      async () => {
        attempts++;
        if (attempts < 3) throw busyError();
        return 'recovered';
      },
      { baseDelayMs: 1 }
    );
    expect(result).toBe('recovered');
    expect(attempts).toBe(3);
  });

  test('throws after exhausting retries on persistent busy errors', async () => {
    let attempts = 0;
    await withBusyRetry(
      async () => {
        attempts++;
        throw busyError();
      },
      { baseDelayMs: 1, maxRetries: 2 }
    ).catch((error) => {
      expect(isSqliteBusyError(error)).toBe(true);
    });
    // Initial attempt + 2 retries
    expect(attempts).toBe(3);
  });

  test('does not retry non-busy errors', async () => {
    let attempts = 0;
    await expect(
      withBusyRetry(
        async () => {
          attempts++;
          throw new Error('UNIQUE constraint failed: memories.id');
        },
        { baseDelayMs: 1 }
      )
    ).rejects.toThrow('UNIQUE constraint failed');
    expect(attempts).toBe(1);
  });

  test('preserves the resolved value type through retries', async () => {
    const rows = [{ id: 'a' }, { id: 'b' }];
    const result = await withBusyRetry(async () => rows, { baseDelayMs: 1 });
    expect(result).toEqual(rows);
  });
});
