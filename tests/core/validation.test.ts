import { describe, test, expect } from 'bun:test';
import {
  validateLimit,
  parseIntBounded,
  validateProjectPath,
  validateUuid,
  requireUuid,
  validateDate,
  normalizeTags,
  clampLimit,
} from '../../core/lib/validation.js';

describe('validateLimit', () => {
  test('returns default value when input is undefined', () => {
    expect(validateLimit(undefined)).toBe(20);
    expect(validateLimit(undefined, 50)).toBe(50);
  });

  test('returns default value when input is null', () => {
    expect(validateLimit(null as any)).toBe(20);
  });

  test('returns default value when input is empty string', () => {
    expect(validateLimit('')).toBe(20);
  });

  test('parses string numbers', () => {
    expect(validateLimit('10')).toBe(10);
    expect(validateLimit('50')).toBe(50);
  });

  test('clamps values below minimum', () => {
    expect(validateLimit(0)).toBe(1);
    expect(validateLimit(-5)).toBe(1);
    expect(validateLimit(0, 20, 1, 100)).toBe(1);
  });

  test('clamps values above maximum', () => {
    expect(validateLimit(150)).toBe(100);
    expect(validateLimit(200, 20, 1, 100)).toBe(100);
  });

  test('returns value within bounds', () => {
    expect(validateLimit(5)).toBe(5);
    expect(validateLimit(50, 20, 1, 100)).toBe(50);
    expect(validateLimit(1)).toBe(1);
    expect(validateLimit(100)).toBe(100);
  });

  test('handles custom min/max', () => {
    expect(validateLimit(5, 10, 1, 20)).toBe(5);
    expect(validateLimit(0, 10, 1, 20)).toBe(1);
    expect(validateLimit(25, 10, 1, 20)).toBe(20);
  });

  test('returns NaN for non-numeric strings', () => {
    const result = validateLimit('abc');
    expect(isNaN(result)).toBe(true);
  });

  test('truncates decimal numbers to integers', () => {
    expect(validateLimit(10.7)).toBe(10);
    expect(validateLimit(10.7, 20, 1, 100)).toBe(10);
    expect(validateLimit(10.1)).toBe(10);
    expect(validateLimit(99.9, 20, 1, 100)).toBe(99);
  });
});

describe('parseIntBounded', () => {
  test('returns default when value is undefined', () => {
    expect(parseIntBounded(undefined, 10, 1, 100)).toBe(10);
  });

  test('returns default when value is null', () => {
    expect(parseIntBounded(null as any, 10, 1, 100)).toBe(10);
  });

  test('parses string numbers', () => {
    expect(parseIntBounded('25', 10, 1, 100)).toBe(25);
    expect(parseIntBounded('50', 10, 1, 100)).toBe(50);
  });

  test('returns number values as-is within bounds', () => {
    expect(parseIntBounded(30, 10, 1, 100)).toBe(30);
  });

  test('clamps to minimum', () => {
    expect(parseIntBounded(0, 10, 1, 100)).toBe(1);
    expect(parseIntBounded(-10, 10, 1, 100)).toBe(1);
  });

  test('clamps to maximum', () => {
    expect(parseIntBounded(150, 10, 1, 100)).toBe(100);
    expect(parseIntBounded(200, 10, 1, 100)).toBe(100);
  });

  test('returns NaN for invalid strings', () => {
    const result = parseIntBounded('abc', 10, 1, 100);
    expect(isNaN(result)).toBe(true);
  });

  test('truncates decimal numbers', () => {
    expect(parseIntBounded(10.9, 10, 1, 100)).toBe(10);
    expect(parseIntBounded(10.1, 10, 1, 100)).toBe(10);
  });
});

describe('validateUuid', () => {
  test('returns true for valid UUIDs', () => {
    const validUuids = [
      '550e8400-e29b-41d4-a716-446655440000',
      '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
      'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    ];
    validUuids.forEach((uuid) => {
      expect(validateUuid(uuid)).toBe(true);
    });
  });

  test('returns false for invalid UUIDs', () => {
    const invalidUuids = [
      'not-a-uuid',
      '12345',
      '550e8400-e29b-41d4-a716', // too short
      '550e8400-e29b-41d4-a716-4466554400001234', // too long
      '550e8400e29b41d4a716446655440000', // missing hyphens
      '',
    ];
    invalidUuids.forEach((uuid) => {
      expect(validateUuid(uuid)).toBe(false);
    });
  });

  test('is case-insensitive', () => {
    expect(validateUuid('550E8400-E29B-41D4-A716-446655440000')).toBe(true);
    expect(validateUuid('A1B2C3D4-E5F6-7890-ABCD-EF1234567890')).toBe(true);
  });
});

describe('requireUuid', () => {
  test('returns the UUID if valid', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    expect(requireUuid(uuid)).toBe(uuid);
  });

  test('throws error for invalid UUID', () => {
    expect(() => requireUuid('invalid')).toThrow('Invalid UUID');
    expect(() => requireUuid('12345')).toThrow('Invalid UUID');
    expect(() => requireUuid('')).toThrow('Invalid UUID');
  });
});

describe('validateDate', () => {
  test('returns null for undefined/null/empty', () => {
    expect(validateDate(undefined)).toBeNull();
    expect(validateDate(null as any)).toBeNull();
    expect(validateDate('')).toBeNull();
  });

  test('converts Date objects', () => {
    const date = new Date('2024-01-15T10:30:00Z');
    const result = validateDate(date);
    expect(result).toBeInstanceOf(Date);
    expect(result?.getTime()).toBe(date.getTime());
  });

  test('parses ISO strings', () => {
    const result = validateDate('2024-01-15T10:30:00.000Z');
    expect(result).toBeInstanceOf(Date);
    expect(result?.getTime()).toBe(Date.parse('2024-01-15T10:30:00.000Z'));
  });

  test('parses date strings', () => {
    const result = validateDate('2024-01-15');
    expect(result).toBeInstanceOf(Date);
    expect(result?.getFullYear()).toBe(2024);
    expect(result?.getMonth()).toBe(0); // January
    expect(result?.getDate()).toBe(15);
  });

  test('parses timestamps (milliseconds)', () => {
    const timestamp = 1700000000000;
    const result = validateDate(timestamp);
    expect(result).toBeInstanceOf(Date);
    expect(result?.getTime()).toBe(timestamp);
  });

  test('parses timestamps (seconds)', () => {
    const timestamp = 1700000000;
    const result = validateDate(timestamp);
    expect(result).toBeInstanceOf(Date);
    expect(result?.getTime()).toBe(timestamp * 1000);
  });

  test('returns null for invalid date strings', () => {
    expect(validateDate('not a date')).toBeNull();
    expect(validateDate('abcd1234')).toBeNull();
  });

  test('returns null for invalid numbers', () => {
    expect(validateDate(-1)).toBeNull();
    expect(validateDate(NaN)).toBeNull();
    expect(validateDate(Infinity)).toBeNull();
  });

  test('returns null for other types', () => {
    expect(validateDate({} as any)).toBeNull();
    expect(validateDate([] as any)).toBeNull();
    // Functions are not valid input types
  });
});

describe('normalizeTags', () => {
  test('returns empty array for undefined', () => {
    expect(normalizeTags(undefined)).toEqual([]);
  });

  test('returns empty array for null', () => {
    expect(normalizeTags(null as any)).toEqual([]);
  });

  test('returns array as-is', () => {
    const tags = ['tag1', 'tag2', 'tag3'];
    expect(normalizeTags(tags)).toEqual(tags);
  });

  test('trims whitespace from tags', () => {
    const tags = [' tag1 ', ' tag2 ', ' tag3 '];
    expect(normalizeTags(tags)).toEqual(['tag1', 'tag2', 'tag3']);
  });

  test('removes empty tags', () => {
    const tags = ['tag1', '', 'tag2', '   ', 'tag3'];
    expect(normalizeTags(tags)).toEqual(['tag1', 'tag2', 'tag3']);
  });

  test('handles array with all empty tags', () => {
    expect(normalizeTags(['', '   '])).toEqual([]);
  });
});

describe('clampLimit', () => {
  test('backward compatibility: works as before', () => {
    expect(clampLimit(5, 10, 1, 100)).toBe(5);
    expect(clampLimit(0, 10, 1, 100)).toBe(1);
    expect(clampLimit(150, 10, 1, 100)).toBe(100);
    expect(clampLimit(undefined, 10, 1, 100)).toBe(10);
  });
});
