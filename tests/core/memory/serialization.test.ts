import { describe, test, expect } from 'bun:test';
import { serializeTags, deserializeTags, serializeMetadata, deserializeMetadata } from '../../../core/memory/serialization.js';

describe('serializeTags', () => {
  test('returns null for empty tags', () => {
    expect(serializeTags([])).toBeNull();
    expect(serializeTags(undefined)).toBeNull();
  });

  test('returns JSON string for non-empty tags', () => {
    expect(serializeTags(['tag1', 'tag2'])).toBe('["tag1","tag2"]');
  });

  test('returns null for single empty tag', () => {
    expect(serializeTags([''])).toBeNull();
  });
});

describe('deserializeTags', () => {
  test('parses JSON string', () => {
    expect(deserializeTags('["tag1","tag2"]')).toEqual(['tag1', 'tag2']);
    expect(deserializeTags('[]')).toEqual([]);
    expect(deserializeTags(null)).toEqual([]);
    expect(deserializeTags(undefined)).toEqual([]);
  });

  test('handles legacy comma-separated format', () => {
    expect(deserializeTags('tag1,tag2,tag3')).toEqual(['tag1', 'tag2', 'tag3']);
    expect(deserializeTags('  tag1  ,  tag2  ')).toEqual(['tag1', 'tag2']);
  });

  test('returns single-item array for malformed JSON without commas', () => {
    // Legacy fallback: splits by comma, so single word becomes single-item array
    expect(deserializeTags('invalid json')).toEqual(['invalid json']);
  });

  test('returns empty array for empty string', () => {
    expect(deserializeTags('')).toEqual([]);
  });

  test('passes through arrays directly', () => {
    expect(deserializeTags(['tag1', 'tag2'])).toEqual(['tag1', 'tag2']);
    expect(deserializeTags([])).toEqual([]);
  });
});

describe('serializeMetadata', () => {
  test('returns null for undefined/null', () => {
    expect(serializeMetadata(undefined)).toBeNull();
    expect(serializeMetadata(null)).toBeNull();
  });

  test('returns JSON string for object', () => {
    const metadata = { key1: 'value1', key2: 123 };
    expect(serializeMetadata(metadata)).toBe('{"key1":"value1","key2":123}');
  });

  test('returns JSON string for empty object', () => {
    expect(serializeMetadata({})).toBe('{}');
  });
});

describe('deserializeMetadata', () => {
  test('parses JSON string', () => {
    expect(deserializeMetadata('{"key1":"value1","key2":123}')).toEqual({ key1: 'value1', key2: 123 });
    expect(deserializeMetadata('null')).toBeNull();
    expect(deserializeMetadata(null)).toBeNull();
    expect(deserializeMetadata(undefined)).toBeNull();
  });

  test('returns null for malformed JSON', () => {
    expect(deserializeMetadata('invalid json')).toBeNull();
  });

  test('passes through objects directly', () => {
    const metadata = { key1: 'value1', key2: 123 };
    expect(deserializeMetadata(metadata)).toEqual(metadata);
    expect(deserializeMetadata(null)).toBeNull();
  });
});
