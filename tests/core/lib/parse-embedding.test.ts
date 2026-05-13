import { describe, it, expect } from 'vitest';
import { parseEmbedding } from '../../../core/lib/parse-embedding.js';

describe('parseEmbedding', () => {
  describe('null/undefined handling', () => {
    it('should return null for null input', () => {
      expect(parseEmbedding(null)).toBeNull();
    });

    it('should return null for undefined input', () => {
      expect(parseEmbedding(undefined)).toBeNull();
    });

    it('should return null for falsy values', () => {
      expect(parseEmbedding(0)).toBeNull();
      expect(parseEmbedding('')).toBeNull();
      expect(parseEmbedding(false)).toBeNull();
    });
  });

  describe('Array handling', () => {
    it('should return array as-is for number array', () => {
      const embedding = [0.1, 0.2, 0.3, -0.5, 0.8];
      expect(parseEmbedding(embedding)).toEqual(embedding);
    });

    it('should return empty array for empty array', () => {
      expect(parseEmbedding([])).toEqual([]);
    });
  });

  describe('Float32Array handling', () => {
    it('should convert Float32Array to number array', () => {
      const floatArray = new Float32Array([0.1, 0.2, 0.3, -0.5, 0.8]);
      const result = parseEmbedding(floatArray);
      expect(result).toHaveLength(5);
      expect(result![0]).toBeCloseTo(0.1, 5);
      expect(result![1]).toBeCloseTo(0.2, 5);
      expect(result![2]).toBeCloseTo(0.3, 5);
      expect(result![3]).toBeCloseTo(-0.5, 5);
      expect(result![4]).toBeCloseTo(0.8, 5);
    });

    it('should handle Float32Array view into larger buffer', () => {
      const buffer = new ArrayBuffer(40);
      const floatView = new Float32Array(buffer, 0, 5);
      floatView.set([0.1, 0.2, 0.3, -0.5, 0.8]);
      const result = parseEmbedding(floatView);
      expect(result).toHaveLength(5);
      expect(result![0]).toBeCloseTo(0.1, 5);
    });
  });

  describe('Uint8Array handling', () => {
    it('should convert Uint8Array containing binary float data to array', () => {
      const floatArray = new Float32Array([0.1, 0.2, 0.3]);
      const uintArray = new Uint8Array(floatArray.buffer);
      const result = parseEmbedding(uintArray);
      expect(result).toHaveLength(3);
      expect(result![0]).toBeCloseTo(0.1, 5);
      expect(result![1]).toBeCloseTo(0.2, 5);
    });
  });

  describe('Buffer handling', () => {
    it('should convert Buffer containing binary float data to array', () => {
      const floatArray = new Float32Array([0.1, 0.2, 0.3]);
      const buffer = Buffer.from(floatArray.buffer);
      const result = parseEmbedding(buffer);
      expect(result).toHaveLength(3);
      expect(result![0]).toBeCloseTo(0.1, 5);
      expect(result![1]).toBeCloseTo(0.2, 5);
    });
  });

  describe('JSON string handling', () => {
    it('should parse JSON string array', () => {
      expect(parseEmbedding('[0.1, 0.2, 0.3]')).toEqual([0.1, 0.2, 0.3]);
    });

    it('should parse nested JSON array', () => {
      expect(parseEmbedding('  [0.5, -0.8, 1.0]  ')).toEqual([0.5, -0.8, 1.0]);
    });

    it('should return null for invalid JSON string', () => {
      expect(parseEmbedding('not-valid-json')).toBeNull();
    });
  });

  describe('edge cases', () => {
    it('should return null for non-array JSON', () => {
      expect(parseEmbedding('{"embedding": "data"}')).toBeNull();
      expect(parseEmbedding('123')).toBeNull();
      expect(parseEmbedding('"string"')).toBeNull();
    });
  });
});