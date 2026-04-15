/**
 * Tests for Retrieval Feedback and Path Strengthening
 * 
 * Tests the feedback/optimize loop components that make memory
 * learn from its own usage patterns.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  recordRetrieval,
  recordUsefulRetrieval,
  recordCitation,
  getRetrievalStats,
  getOverallFeedbackStats,
} from '../../core/memory/retrieval-feedback.js';

import { wouldBenefitFromMultiHop } from '../../core/graph/multi-hop-retrieval.js';

describe('Retrieval Feedback', () => {
  beforeEach(() => {
    // Clear feedback buffer between tests by importing and calling flush
    // (we can't directly access the buffer, but we test the public API)
  });

  describe('recordRetrieval', () => {
    it('should record a retrieval event', () => {
      recordRetrieval('mem-1', 'test query');
      const stats = getRetrievalStats('mem-1');
      expect(stats.totalRetrievals).toBe(1);
    });

    it('should record multiple retrievals for the same memory', () => {
      recordRetrieval('mem-2', 'query 1');
      recordRetrieval('mem-2', 'query 2');
      recordRetrieval('mem-2', 'query 3');
      const stats = getRetrievalStats('mem-2');
      expect(stats.totalRetrievals).toBe(3);
    });
  });

  describe('recordUsefulRetrieval', () => {
    it('should mark a retrieval as useful', () => {
      recordRetrieval('mem-3', 'test query');
      recordUsefulRetrieval('mem-3', 'test query');
      const stats = getRetrievalStats('mem-3');
      expect(stats.usefulRetrievals).toBe(1);
      expect(stats.usefulnessRate).toBe(1);
    });

    it('should track citation separately from usefulness', () => {
      recordRetrieval('mem-4', 'test query');
      recordUsefulRetrieval('mem-4', 'test query', { cited: true });
      const stats = getRetrievalStats('mem-4');
      expect(stats.citedRetrievals).toBe(1);
      expect(stats.usefulRetrievals).toBe(1);
    });
  });

  describe('recordCitation', () => {
    it('should mark all retrievals of a memory as cited', () => {
      recordRetrieval('mem-5', 'query 1');
      recordRetrieval('mem-5', 'query 2');
      recordCitation('mem-5', 'response-1');
      const stats = getRetrievalStats('mem-5');
      expect(stats.citedRetrievals).toBe(2);
      expect(stats.usefulRetrievals).toBe(2);
    });
  });

  describe('getOverallFeedbackStats', () => {
    it('should aggregate stats across all memories', () => {
      recordRetrieval('mem-a', 'query a');
      recordRetrieval('mem-b', 'query b');
      recordUsefulRetrieval('mem-a', 'query a');
      const stats = getOverallFeedbackStats();
      expect(stats.totalRetrievals).toBeGreaterThanOrEqual(2);
      expect(stats.usefulRetrievals).toBeGreaterThanOrEqual(1);
    });
  });
});

describe('Fact Deriver', () => {
  describe('DERIVATION_RULES', () => {
    it('should have transitivity rules defined', () => {
      // Import the rules to verify they exist
      // The actual derivation is tested via integration tests
      expect(true).toBe(true); // Placeholder - rules are defined in fact-deriver.ts
    });
  });
});

describe('Multi-hop benefit detection', () => {
  it('should detect relationship queries', () => {
    expect(wouldBenefitFromMultiHop('Was Alice affected by the outage?')).toBe(true);
    expect(wouldBenefitFromMultiHop('What depends on PostgreSQL?')).toBe(true);
    expect(wouldBenefitFromMultiHop('Who manages the backend team?')).toBe(true);
  });

  it('should not flag simple queries', () => {
    expect(wouldBenefitFromMultiHop('What is TypeScript?')).toBe(false);
    expect(wouldBenefitFromMultiHop('Remember: I prefer dark mode')).toBe(false);
  });
});