import { describe, test, expect } from 'bun:test';
import {
  limitSchema,
  offsetSchema,
  projectIdSchema,
  memoryIdSchema,
  paginationSchema,
  searchQuerySchema,
} from '../../core/lib/schemas.js';

describe('limitSchema', () => {
  test('accepts valid numbers within range', () => {
    expect(limitSchema.parse(1)).toBe(1);
    expect(limitSchema.parse(50)).toBe(50);
    expect(limitSchema.parse(100)).toBe(100);
  });

  test('rejects numbers below minimum', () => {
    expect(() => limitSchema.parse(0)).toThrow();
    expect(() => limitSchema.parse(-1)).toThrow();
  });

  test('rejects numbers above maximum', () => {
    expect(() => limitSchema.parse(101)).toThrow();
    expect(() => limitSchema.parse(200)).toThrow();
  });

  test('rejects non-integer values', () => {
    expect(() => limitSchema.parse(10.5)).toThrow();
    expect(() => limitSchema.parse('10')).toThrow();
  });

  test('applies default value when undefined', () => {
    expect(limitSchema.parse(undefined)).toBe(20);
  });

  test('does not accept null', () => {
    expect(() => limitSchema.parse(null)).toThrow();
  });
});

describe('offsetSchema', () => {
  test('accepts valid numbers >= 0', () => {
    expect(offsetSchema.parse(0)).toBe(0);
    expect(offsetSchema.parse(10)).toBe(10);
    expect(offsetSchema.parse(100)).toBe(100);
  });

  test('rejects negative numbers', () => {
    expect(() => offsetSchema.parse(-1)).toThrow();
    expect(() => offsetSchema.parse(-10)).toThrow();
  });

  test('applies default value when undefined', () => {
    expect(offsetSchema.parse(undefined)).toBe(0);
  });

  test('rejects non-integer values', () => {
    expect(() => offsetSchema.parse(10.5)).toThrow();
    expect(() => offsetSchema.parse('10')).toThrow();
  });
});

describe('projectIdSchema', () => {
  test('accepts non-empty strings', () => {
    expect(projectIdSchema.parse('/path/to/project')).toBe('/path/to/project');
    expect(projectIdSchema.parse('project')).toBe('project');
    expect(projectIdSchema.parse('.')).toBe('.');
  });

  test('rejects empty strings', () => {
    expect(() => projectIdSchema.parse('')).toThrow();
  });

  test('rejects non-string values', () => {
    expect(() => projectIdSchema.parse(123)).toThrow();
    expect(() => projectIdSchema.parse(null)).toThrow();
    expect(() => projectIdSchema.parse(undefined)).toThrow();
  });
});

describe('memoryIdSchema', () => {
  test('accepts valid UUIDs', () => {
    const validUuid = '550e8400-e29b-41d4-a716-446655440000';
    expect(memoryIdSchema.parse(validUuid)).toBe(validUuid);
  });

  test('rejects invalid UUIDs', () => {
    expect(() => memoryIdSchema.parse('not-a-uuid')).toThrow();
    expect(() => memoryIdSchema.parse('12345')).toThrow();
    expect(() => memoryIdSchema.parse('')).toThrow();
  });

  test('is case-insensitive', () => {
    const uuid = '550E8400-E29B-41D4-A716-446655440000';
    expect(memoryIdSchema.parse(uuid)).toBe(uuid);
  });
});

describe('paginationSchema', () => {
  test('accepts valid pagination params', () => {
    const result = paginationSchema.parse({ limit: 50, offset: 10 });
    expect(result.limit).toBe(50);
    expect(result.offset).toBe(10);
  });

  test('applies defaults for missing values', () => {
    const result = paginationSchema.parse({});
    expect(result.limit).toBe(20);
    expect(result.offset).toBe(0);
  });

  test('accepts partial objects', () => {
    const result1 = paginationSchema.parse({ limit: 30 });
    expect(result1.limit).toBe(30);
    expect(result1.offset).toBe(0);

    const result2 = paginationSchema.parse({ offset: 50 });
    expect(result2.limit).toBe(20);
    expect(result2.offset).toBe(50);
  });

  test('validates both limit and offset', () => {
    expect(() => paginationSchema.parse({ limit: 0 })).toThrow();
    expect(() => paginationSchema.parse({ offset: -1 })).toThrow();
    expect(() => paginationSchema.parse({ limit: 101 })).toThrow();
  });
});

describe('searchQuerySchema', () => {
  test('accepts non-empty strings', () => {
    expect(searchQuerySchema.parse('hello world')).toBe('hello world');
    expect(searchQuerySchema.parse('a')).toBe('a');
  });

  test('rejects empty strings', () => {
    expect(() => searchQuerySchema.parse('')).toThrow();
  });

  test('rejects non-string values', () => {
    expect(() => searchQuerySchema.parse(123)).toThrow();
    expect(() => searchQuerySchema.parse(null)).toThrow();
    expect(() => searchQuerySchema.parse(undefined)).toThrow();
  });

  test('trims whitespace', () => {
    const result = searchQuerySchema.parse('  hello  ');
    expect(result).toBe('hello');
  });
});
