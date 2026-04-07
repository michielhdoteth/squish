import { describe, test, expect } from 'bun:test';
import { normalizeTimestamp, now } from '../../core/utils.js';

describe('normalizeTimestamp', () => {
  test('returns null for null/undefined/empty values', () => {
    expect(normalizeTimestamp(null)).toBeNull();
    expect(normalizeTimestamp(undefined)).toBeNull();
    expect(normalizeTimestamp('')).toBeNull();
  });

  test('converts Date instance to ISO string', () => {
    const date = new Date('2024-01-15T10:30:00Z');
    expect(normalizeTimestamp(date)).toBe('2024-01-15T10:30:00.000Z');
  });

  test('handles milliseconds timestamp (13 digits)', () => {
    // 1700000000000 = Jan 14, 2023 00:13:20 UTC
    const result = normalizeTimestamp(1700000000000);
    expect(result).toBe('2023-11-14T22:13:20.000Z');
  });

  test('handles seconds timestamp (10 digits)', () => {
    // 1700000000 = Nov 14, 2023 22:13:20 UTC
    const result = normalizeTimestamp(1700000000);
    expect(result).toBe('2023-11-14T22:13:20.000Z');
  });

  test('handles microseconds timestamp (15+ digits)', () => {
    // 1700000000000000 = Jan 14, 2023 00:13:20 UTC (microseconds)
    const result = normalizeTimestamp(1700000000000000);
    expect(result).toBe('2023-11-14T22:13:20.000Z');
  });

  test('returns null for invalid number', () => {
    expect(normalizeTimestamp(-1)).toBeNull();
    expect(normalizeTimestamp(NaN)).toBeNull();
  });

  test('converts valid ISO string to ISO string', () => {
    const iso = '2024-01-15T10:30:00.000Z';
    expect(normalizeTimestamp(iso)).toBe(iso);
  });

  test('handles non-ISO date strings', () => {
    expect(normalizeTimestamp('2024-01-15')).toBe('2024-01-15T00:00:00.000Z');
    expect(normalizeTimestamp('Jan 15, 2024')).toBe('2024-01-15T00:00:00.000Z');
  });

  test('returns null for unparseable string', () => {
    const invalid = 'not a date';
    expect(normalizeTimestamp(invalid)).toBeNull();
  });

  test('returns null for other types', () => {
    expect(normalizeTimestamp({})).toBeNull();
    expect(normalizeTimestamp([])).toBeNull();
    expect(normalizeTimestamp(() => {})).toBeNull();
  });
});

describe('now', () => {
  test('returns a string', () => {
    const result = now();
    expect(typeof result).toBe('string');
  });

  test('returns valid ISO string', () => {
    const result = now();
    const date = new Date(result);
    expect(!isNaN(date.getTime())).toBe(true);
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  test('returns current time within reasonable delta', () => {
    const before = Date.now();
    const result = now();
    const after = Date.now();

    const timestamp = Date.parse(result);
    expect(timestamp).toBeGreaterThanOrEqual(before - 1000); // Allow 1s clock skew
    expect(timestamp).toBeLessThanOrEqual(after + 1000);
  });

  test('returns ISO string with Z timezone indicator', () => {
    const result = now();
    expect(result.endsWith('Z')).toBe(true);
  });
});
