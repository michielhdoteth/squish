import { describe, it, expect } from 'bun:test';
import { 
  toonEncode, 
  toonDecode, 
  compressForContext, 
  decompressFromContext,
  estimateCompressionRatio,
  toonifyIfBeneficial,
} from '../../core/toon.js';

describe('toon compression', () => {
  describe('toonEncode', () => {
    it('encodes object to TOON format', () => {
      const data = { name: 'Alice', age: 30 };
      const result = toonEncode(data);
      expect(result).toContain('name');
      expect(result).toContain('age');
    });

    it('encodes array of objects as table', () => {
      const data = [
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' },
      ];
      const result = toonEncode(data);
      expect(result).toContain('[2]');
      expect(result).toContain('{id,name}');
    });
  });

  describe('toonDecode', () => {
    it('decodes TOON back to object', () => {
      const toon = 'name: Alice\nage: 30';
      const result = toonDecode(toon);
      expect(result).toEqual({ name: 'Alice', age: 30 });
    });

    it('falls back to JSON parse on invalid TOON', () => {
      const json = '{"name": "Alice"}';
      const result = toonDecode(json);
      expect(result).toEqual({ name: 'Alice' });
    });
  });

  describe('compressForContext', () => {
    it('compresses JSON to TOON', () => {
      const json = JSON.stringify({ users: [{ name: 'Alice' }, { name: 'Bob' }] });
      const result = compressForContext(json);
      expect(result).toContain('[2]');
    });

    it('returns non-JSON as-is', () => {
      const text = 'This is just plain text';
      const result = compressForContext(text);
      expect(result).toBe(text);
    });

    it('returns TOON as-is', () => {
      const toon = 'users[2]{name}:\nAlice\nBob';
      const result = compressForContext(toon);
      expect(result).toBe(toon);
    });
  });

  describe('decompressFromContext', () => {
    it('converts TOON to JSON string', () => {
      const toon = 'name: Alice\nage: 30';
      const result = decompressFromContext(toon);
      expect(result).toContain('"name"');
    });

    it('returns non-TOON as-is', () => {
      const text = 'Just some text';
      const result = decompressFromContext(text);
      expect(result).toBe(text);
    });
  });

  describe('estimateCompressionRatio', () => {
    it('returns positive ratio for compressible JSON', () => {
      const json = JSON.stringify({ users: [{ name: 'Alice' }, { name: 'Bob' }, { name: 'Charlie' }] });
      const ratio = estimateCompressionRatio(json);
      expect(ratio).toBeGreaterThan(0);
    });

    it('returns 0 for non-JSON', () => {
      const ratio = estimateCompressionRatio('not json');
      expect(ratio).toBe(0);
    });
  });

  describe('toonifyIfBeneficial', () => {
    it('converts when compression is beneficial', () => {
      const json = JSON.stringify({ items: Array(10).fill({ name: 'test' }) });
      const result = toonifyIfBeneficial(json, 0.1);
      expect(result).not.toBe(json);
    });

    it('returns original when compression is not beneficial', () => {
      const json = JSON.stringify({ small: 'data' });
      const result = toonifyIfBeneficial(json, 0.5);
      expect(result).toBe(json);
    });
  });
});
