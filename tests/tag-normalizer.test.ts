import { describe, it, expect } from 'bun:test';
import { createNormalizer, tagNormalizer } from '../core/places/tag-normalizer.js';

describe('TagNormalizer', () => {
  it('normalizes lowercase', () => {
    expect(tagNormalizer.normalizeTag('AI')).toBe('ai');
  });
  
  it('replaces spaces with hyphens', () => {
    expect(tagNormalizer.normalizeTag('machine learning')).toBe('machine-learning');
  });
  
  it('removes leading/trailing hyphens', () => {
    expect(tagNormalizer.normalizeTag('-hello-')).toBe('hello');
  });
  
  it('collapses multiple hyphens', () => {
    expect(tagNormalizer.normalizeTag('a--b---c')).toBe('a-b-c');
  });
  
  it('trims whitespace', () => {
    expect(tagNormalizer.normalizeTag('  hello  ')).toBe('hello');
  });
  
  it('removes garbage tags', () => {
    const tags = tagNormalizer.normalizeTags(['important', 'stuff', 'squish', 'project']);
    expect(tags).not.toContain('important');
    expect(tags).not.toContain('stuff');
    expect(tags).toContain('squish');
    expect(tags).toContain('project');
  });
  
  it('removes duplicates', () => {
    const tags = tagNormalizer.normalizeTags(['Squish', 'squish', 'SQUISH']);
    expect(tags).toEqual(['squish']);
  });
  
  it('caps at tagCap', () => {
    const normalizer = createNormalizer({ tagCap: 3 });
    const tags = normalizer.normalizeTags(['alpha', 'bravo', 'charlie', 'delta', 'echo']);
    expect(tags.length).toBe(3);
  });
  
  it('removes empty tags', () => {
    const tags = tagNormalizer.normalizeTags(['', '  ', '-', 'hello']);
    expect(tags).toEqual(['hello']);
  });
  
  it('returns sorted tags', () => {
    const tags = tagNormalizer.normalizeTags(['zebra', 'apple', 'mango']);
    expect(tags).toEqual(['apple', 'mango', 'zebra']);
  });
  
  it('validates tags correctly', () => {
    expect(tagNormalizer.isValidTag('squish')).toBe(true);
    expect(tagNormalizer.isValidTag('ai')).toBe(false);
    expect(tagNormalizer.isValidTag('x')).toBe(false); // too short
  });
});