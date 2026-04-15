import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { serializeTags, deserializeTags, serializeMetadata, deserializeMetadata } from '../../../core/memory/serialization.js';
import { config } from '../../../config.js';

describe('serializeTags', () => {
  let originalIsTeamMode: boolean;
  
  beforeEach(() => {
    originalIsTeamMode = config.isTeamMode;
  });
  
  afterEach(() => {
    config.isTeamMode = originalIsTeamMode;
  });
  
  test('returns null for empty tags in team mode', () => {
    config.isTeamMode = true;
    expect(serializeTags([])).toBeNull();
    expect(serializeTags(undefined)).toBeNull();
  });
  
  test('returns array for non-empty tags in team mode', () => {
    config.isTeamMode = true;
    expect(serializeTags(['tag1', 'tag2'])).toEqual(['tag1', 'tag2']);
  });
  
  test('returns null for empty tags in local mode', () => {
    config.isTeamMode = false;
    expect(serializeTags([])).toBeNull();
    expect(serializeTags(undefined)).toBeNull();
  });
  
  test('returns JSON string for non-empty tags in local mode', () => {
    config.isTeamMode = false;
    expect(serializeTags(['tag1', 'tag2'])).toBe('["tag1","tag2"]');
  });
});

describe('deserializeTags', () => {
  let originalIsTeamMode: boolean;
  
  beforeEach(() => {
    originalIsTeamMode = config.isTeamMode;
  });
  
  afterEach(() => {
    config.isTeamMode = originalIsTeamMode;
  });
  
  test('returns array directly in team mode', () => {
    config.isTeamMode = true;
    expect(deserializeTags(['tag1', 'tag2'])).toEqual(['tag1', 'tag2']);
    expect(deserializeTags([])).toEqual([]);
    expect(deserializeTags(null)).toEqual([]);
    expect(deserializeTags(undefined)).toEqual([]);
  });
  
  test('parses JSON string in local mode', () => {
    config.isTeamMode = false;
    expect(deserializeTags('["tag1","tag2"]')).toEqual(['tag1', 'tag2']);
    expect(deserializeTags('[]')).toEqual([]);
    expect(deserializeTags(null)).toEqual([]);
    expect(deserializeTags(undefined)).toEqual([]);
  });
  
  test('handles legacy comma-separated format in local mode', () => {
    config.isTeamMode = false;
    expect(deserializeTags('tag1,tag2,tag3')).toEqual(['tag1', 'tag2', 'tag3']);
    expect(deserializeTags('  tag1  ,  tag2  ')).toEqual(['tag1', 'tag2']);
  });
  
  test('returns single-item array for malformed JSON without commas in local mode', () => {
    config.isTeamMode = false;
    // Legacy fallback: splits by comma, so single word becomes single-item array
    expect(deserializeTags('invalid json')).toEqual(['invalid json']);
  });
  
  test('returns empty array for empty string in local mode', () => {
    config.isTeamMode = false;
    expect(deserializeTags('')).toEqual([]);
  });
});

describe('serializeMetadata', () => {
  let originalIsTeamMode: boolean;
  
  beforeEach(() => {
    originalIsTeamMode = config.isTeamMode;
  });
  
  afterEach(() => {
    config.isTeamMode = originalIsTeamMode;
  });
  
  test('returns null for undefined/null in team mode', () => {
    config.isTeamMode = true;
    expect(serializeMetadata(undefined)).toBeNull();
    expect(serializeMetadata(null)).toBeNull();
  });
  
  test('returns empty object as-is in team mode', () => {
    config.isTeamMode = true;
    expect(serializeMetadata({})).toEqual({});
  });
  
  test('returns object directly in team mode', () => {
    config.isTeamMode = true;
    const metadata = { key1: 'value1', key2: 123 };
    expect(serializeMetadata(metadata)).toEqual(metadata);
  });
  
  test('returns null for undefined/null in local mode', () => {
    config.isTeamMode = false;
    expect(serializeMetadata(undefined)).toBeNull();
    expect(serializeMetadata(null)).toBeNull();
  });
  
  test('returns JSON string for object in local mode', () => {
    config.isTeamMode = false;
    const metadata = { key1: 'value1', key2: 123 };
    expect(serializeMetadata(metadata)).toBe('{"key1":"value1","key2":123}');
  });
  
  test('returns JSON string for empty object in local mode', () => {
    config.isTeamMode = false;
    expect(serializeMetadata({})).toBe('{}');
  });
});

describe('deserializeMetadata', () => {
  let originalIsTeamMode: boolean;
  
  beforeEach(() => {
    originalIsTeamMode = config.isTeamMode;
  });
  
  afterEach(() => {
    config.isTeamMode = originalIsTeamMode;
  });
  
  test('returns object or null directly in team mode', () => {
    config.isTeamMode = true;
    const metadata = { key1: 'value1', key2: 123 };
    expect(deserializeMetadata(metadata)).toEqual(metadata);
    expect(deserializeMetadata(null)).toBeNull();
    // undefined should also return null (since callers use ?? null, but just in case)
    expect(deserializeMetadata(undefined)).toBeNull();
  });
  
  test('parses JSON string in local mode', () => {
    config.isTeamMode = false;
    expect(deserializeMetadata('{"key1":"value1","key2":123}')).toEqual({ key1: 'value1', key2: 123 });
    expect(deserializeMetadata('null')).toBeNull();
    expect(deserializeMetadata(null)).toBeNull();
    expect(deserializeMetadata(undefined)).toBeNull();
  });
  
  test('returns null for malformed JSON in local mode', () => {
    config.isTeamMode = false;
    expect(deserializeMetadata('invalid json')).toBeNull();
  });
});
