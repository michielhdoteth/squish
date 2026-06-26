/**
 * Tests for MMR Diversity Injection
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import {
  getMMRConfig,
  applyMMR,
  applyMMRByContent,
  smartMMR,
  checkHealth,
} from '../../core/retrieval/mmr-diversity.js';
import type { SearchResult } from '../../core/memory/memories.js';

describe('MMR Diversity', () => {
  const originalEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    originalEnv.SQUISH_MMR_ENABLED = process.env.SQUISH_MMR_ENABLED;
    originalEnv.SQUISH_MMR_LAMBDA = process.env.SQUISH_MMR_LAMBDA;
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  describe('getMMRConfig', () => {
    it('should return default config when no env vars set', () => {
      delete process.env.SQUISH_MMR_ENABLED;
      delete process.env.SQUISH_MMR_LAMBDA;

      const cfg = getMMRConfig();
      expect(cfg.enabled).toBe(false);
      expect(cfg.lambda).toBe(0.7);
      expect(cfg.topK).toBe(10);
      expect(cfg.candidatePool).toBe(50);
    });

    it('should read from env vars', () => {
      process.env.SQUISH_MMR_ENABLED = 'true';
      process.env.SQUISH_MMR_LAMBDA = '0.5';

      const cfg = getMMRConfig();
      expect(cfg.enabled).toBe(true);
      expect(cfg.lambda).toBe(0.5);
    });
  });

  describe('applyMMR', () => {
    it('should return empty array for empty results', () => {
      const results = applyMMR([1, 0, 0], []);
      expect(results).toEqual([]);
    });

    it('should return results when disabled', () => {
      delete process.env.SQUISH_MMR_ENABLED;

      const mockResults: SearchResult[] = [
        { id: '1', content: 'doc1', similarity: 0.9 },
        { id: '2', content: 'doc2', similarity: 0.8 },
      ];

      const results = applyMMR(null, mockResults);
      expect(results.length).toBe(2);
    });

    it('should limit results to topK', () => {
      process.env.SQUISH_MMR_ENABLED = 'true';
      process.env.SQUISH_MMR_LAMBDA = '0.7';

      const mockResults: SearchResult[] = Array.from({ length: 50 }, (_, i) => ({
        id: String(i),
        content: `doc${i}`,
        similarity: 0.9 - i * 0.01,
        embedding: Array(10).fill(0).map(() => Math.random()),
      }));

      const results = applyMMR([1, 0, 0, 0, 0, 0, 0, 0, 0, 0], mockResults, {
        topK: 5,
      });

      expect(results.length).toBe(5);
    });

    it('should return diverse results', () => {
      process.env.SQUISH_MMR_ENABLED = 'true';
      process.env.SQUISH_MMR_LAMBDA = '0.5';

      // Create similar documents (same embedding)
      const similarEmbedding = [1, 0, 0, 0, 0];
      const mockResults: SearchResult[] = [
        { id: '1', content: 'doc1', similarity: 0.9, embedding: similarEmbedding },
        { id: '2', content: 'doc2', similarity: 0.85, embedding: similarEmbedding },
        { id: '3', content: 'doc3', similarity: 0.8, embedding: similarEmbedding },
      ];

      const results = applyMMR([1, 0, 0, 0, 0], mockResults, { topK: 3 });
      expect(results.length).toBe(3);
    });
  });

  describe('applyMMRByContent', () => {
    it('should diversify based on content similarity', () => {
      process.env.SQUISH_MMR_ENABLED = 'true';
      process.env.SQUISH_MMR_LAMBDA = '0.5';

      const mockResults: SearchResult[] = [
        { id: '1', content: 'react javascript frontend', similarity: 0.9 },
        { id: '2', content: 'react javascript component', similarity: 0.85 },
        { id: '3', content: 'python backend api', similarity: 0.8 },
      ];

      const results = applyMMRByContent(mockResults, { topK: 3 });
      expect(results.length).toBe(3);
      // First result should be most relevant
      expect(results[0].id).toBe('1');
    });

    it('should handle empty content', () => {
      process.env.SQUISH_MMR_ENABLED = 'true';

      const mockResults: SearchResult[] = [
        { id: '1', content: '', similarity: 0.9 },
        { id: '2', content: '', similarity: 0.8 },
      ];

      const results = applyMMRByContent(mockResults, { topK: 2 });
      expect(results.length).toBe(2);
    });
  });

  describe('smartMMR', () => {
    it('should try embedding-based first, then fallback to content', () => {
      process.env.SQUISH_MMR_ENABLED = 'true';
      process.env.SQUISH_MMR_LAMBDA = '0.7';

      const mockResults: SearchResult[] = [
        { id: '1', content: 'react frontend', similarity: 0.9 },
        { id: '2', content: 'vue frontend', similarity: 0.85 },
      ];

      // Without embeddings, should fallback to content-based
      const results = smartMMR(null, mockResults, { topK: 2 });
      expect(results.length).toBe(2);
    });

    it('should use embeddings when available', () => {
      process.env.SQUISH_MMR_ENABLED = 'true';
      process.env.SQUISH_MMR_LAMBDA = '0.7';

      const mockResults: SearchResult[] = [
        { id: '1', content: 'doc1', similarity: 0.9, embedding: [1, 0, 0] },
        { id: '2', content: 'doc2', similarity: 0.85, embedding: [0, 1, 0] },
      ];

      const results = smartMMR([1, 0, 0], mockResults, { topK: 2 });
      expect(results.length).toBe(2);
    });
  });

  describe('checkHealth', () => {
    it('should report status', () => {
      const health = checkHealth();
      expect(health).toHaveProperty('enabled');
      expect(health).toHaveProperty('lambda');
    });
  });
});
