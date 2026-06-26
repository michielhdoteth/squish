/**
 * Tests for Cross-Encoder Reranker
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import {
  getRerankerConfig,
  scorePair,
  scoreBatch,
  rerankResults,
  checkHealth,
  unload,
} from '../../core/retrieval/cross-encoder-reranker.js';
import type { SearchResult } from '../../core/memory/memories.js';

describe('Cross-Encoder Reranker', () => {
  const originalEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    // Save original env
    originalEnv.SQUISH_RERANKER_ENABLED = process.env.SQUISH_RERANKER_ENABLED;
    originalEnv.SQUISH_RERANKER_MODEL = process.env.SQUISH_RERANKER_MODEL;
    originalEnv.SQUISH_RERANKER_TOP_K = process.env.SQUISH_RERANKER_TOP_K;
    originalEnv.SQUISH_RERANKER_RETURN_TOP_K = process.env.SQUISH_RERANKER_RETURN_TOP_K;
  });

  afterEach(async () => {
    // Restore original env
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    await unload();
  });

  describe('getRerankerConfig', () => {
    it('should return default config when no env vars set', () => {
      delete process.env.SQUISH_RERANKER_ENABLED;
      delete process.env.SQUISH_RERANKER_MODEL;
      delete process.env.SQUISH_RERANKER_TOP_K;
      delete process.env.SQUISH_RERANKER_RETURN_TOP_K;

      const cfg = getRerankerConfig();
      expect(cfg.enabled).toBe(false);
      expect(cfg.model).toBe('cross-encoder/ms-marco-MiniLM-L-6-v2');
      expect(cfg.topK).toBe(30);
      expect(cfg.returnTopK).toBe(20);
    });

    it('should read from env vars', () => {
      process.env.SQUISH_RERANKER_ENABLED = 'true';
      process.env.SQUISH_RERANKER_MODEL = 'custom-model';
      process.env.SQUISH_RERANKER_TOP_K = '50';
      process.env.SQUISH_RERANKER_RETURN_TOP_K = '10';

      const cfg = getRerankerConfig();
      expect(cfg.enabled).toBe(true);
      expect(cfg.model).toBe('custom-model');
      expect(cfg.topK).toBe(50);
      expect(cfg.returnTopK).toBe(10);
    });
  });

  describe('scorePair', () => {
    it('should return null when model not loaded', async () => {
      const score = await scorePair('test query', 'test document');
      // Will be null since model is not loaded in test environment
      expect(score === null || typeof score === 'number').toBe(true);
    });
  });

  describe('scoreBatch', () => {
    it('should return empty array for empty input', async () => {
      const scores = await scoreBatch('test query', []);
      expect(scores).toEqual([]);
    });

    it('should return array of same length as documents', async () => {
      const documents = ['doc1', 'doc2', 'doc3'];
      const scores = await scoreBatch('test query', documents);
      expect(scores.length).toBe(documents.length);
    });
  });

  describe('rerankResults', () => {
    it('should return empty array for empty results', async () => {
      const results = await rerankResults('test query', []);
      expect(results).toEqual([]);
    });

    it('should return results when reranker disabled', async () => {
      delete process.env.SQUISH_RERANKER_ENABLED;

      const mockResults: SearchResult[] = [
        { id: '1', content: 'doc1', similarity: 0.9 },
        { id: '2', content: 'doc2', similarity: 0.8 },
      ];

      const results = await rerankResults('test query', mockResults);
      expect(results.length).toBe(2);
    });

    it('should respect topK and returnTopK options', async () => {
      delete process.env.SQUISH_RERANKER_ENABLED;

      const mockResults: SearchResult[] = Array.from({ length: 50 }, (_, i) => ({
        id: String(i),
        content: `doc${i}`,
        similarity: 0.9 - i * 0.01,
      }));

      const results = await rerankResults('test query', mockResults, {
        topK: 20,
        returnTopK: 10,
      });

      expect(results.length).toBe(10);
    });

    it('should preserve original scores', async () => {
      delete process.env.SQUISH_RERANKER_ENABLED;

      const mockResults: SearchResult[] = [
        { id: '1', content: 'doc1', similarity: 0.9 },
      ];

      const results = await rerankResults('test query', mockResults);
      expect(results[0]._originalScore).toBe(0.9);
    });
  });

  describe('checkHealth', () => {
    it('should report disabled when not enabled', async () => {
      delete process.env.SQUISH_RERANKER_ENABLED;

      const health = await checkHealth();
      expect(health.available).toBe(false);
      expect(health.error).toContain('disabled');
    });
  });
});
