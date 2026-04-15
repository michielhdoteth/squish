/**
 * Tests for Graph Traversal
 * 
 * Tests the BFS/DFS traversal, path finding, and neighborhood
 * functions that power multi-hop queries.
 */

import { describe, it, expect } from 'vitest';

// These are pure logic tests that don't require database.
// The database-dependent functions (traverse, findPaths, getNeighborhood)
// are tested via integration tests.

import { wouldBenefitFromMultiHop, explainRetrievalPath, type MultiHopResult } from '../../core/graph/multi-hop-retrieval.js';

describe('Multi-Hop Retrieval', () => {
  describe('wouldBenefitFromMultiHop', () => {
    it('should return true for relationship queries', () => {
      expect(wouldBenefitFromMultiHop('Was Alice\'s project affected by the outage?')).toBe(true);
    });

    it('should return true for "depends on" queries', () => {
      expect(wouldBenefitFromMultiHop('What does the auth service depend on?')).toBe(true);
    });

    it('should return true for "works on" queries', () => {
      expect(wouldBenefitFromMultiHop('Who works on the database team?')).toBe(true);
    });

    it('should return true for "uses" queries', () => {
      expect(wouldBenefitFromMultiHop('Which services use PostgreSQL?')).toBe(true);
    });

    it('should return true for impact/cause queries', () => {
      expect(wouldBenefitFromMultiHop('What caused the outage?')).toBe(true);
      expect(wouldBenefitFromMultiHop('How does this affect the system?')).toBe(true);
    });

    it('should return true for "related to" queries', () => {
      expect(wouldBenefitFromMultiHop('What is related to the payment module?')).toBe(true);
    });

    it('should return false for simple factual queries', () => {
      expect(wouldBenefitFromMultiHop('What is the capital of France?')).toBe(false);
    });

    it('should return false for simple preference queries', () => {
      expect(wouldBenefitFromMultiHop('I prefer TypeScript over JavaScript')).toBe(false);
    });

    it('should return true for "which project" queries', () => {
      expect(wouldBenefitFromMultiHop('Which project is the database team working on?')).toBe(true);
    });
  });

  describe('explainRetrievalPath', () => {
    it('should explain vector-only results', () => {
      const result: MultiHopResult = {
        id: 'test-1',
        content: 'test content',
        type: 'fact',
        hybridScore: 85.5,
        semanticScore: 0.9,
        recencyScore: 0.8,
        coactivationScore: 0.5,
        importanceScore: 0.7,
        confidenceScore: 0.9,
        feedbackScore: 0.6,
        entityBoost: 0.5,
        rank: 1,
        retrievalPath: 'vector',
      };

      const explanation = explainRetrievalPath(result);
      expect(explanation).toContain('semantic search');
      expect(explanation).toContain('85.5');
    });

    it('should explain graph results with path', () => {
      const result: MultiHopResult = {
        id: 'test-2',
        content: 'test content',
        type: 'fact',
        hybridScore: 78.3,
        semanticScore: 0.7,
        recencyScore: 0.6,
        coactivationScore: 0.4,
        importanceScore: 0.6,
        confidenceScore: 0.8,
        feedbackScore: 0.5,
        entityBoost: 0.5,
        rank: 2,
        retrievalPath: 'graph',
        graphPath: {
          nodes: [
            { id: '1', name: 'Alice', type: 'person', description: null, properties: null },
            { id: '2', name: 'Project Atlas', type: 'concept', description: null, properties: null },
            { id: '3', name: 'PostgreSQL', type: 'tool', description: null, properties: null },
          ],
          edges: [
            { id: 'e1', fromId: '1', toId: '2', relationType: 'works_on', weight: 5, properties: null },
            { id: 'e2', fromId: '2', toId: '3', relationType: 'uses', weight: 8, properties: null },
          ],
          totalWeight: 13,
          hopCount: 2,
        },
      };

      const explanation = explainRetrievalPath(result);
      expect(explanation).toContain('knowledge graph');
      expect(explanation).toContain('Alice');
      expect(explanation).toContain('Project Atlas');
      expect(explanation).toContain('PostgreSQL');
      expect(explanation).toContain('2');
    });

    it('should explain both-path results', () => {
      const result: MultiHopResult = {
        id: 'test-3',
        content: 'test content',
        type: 'fact',
        hybridScore: 92.1,
        semanticScore: 0.95,
        recencyScore: 0.9,
        coactivationScore: 0.7,
        importanceScore: 0.8,
        confidenceScore: 0.9,
        feedbackScore: 0.7,
        entityBoost: 0.6,
        rank: 1,
        retrievalPath: 'both',
        graphPath: {
          nodes: [
            { id: '1', name: 'Alice', type: 'person', description: null, properties: null },
            { id: '2', name: 'Project Atlas', type: 'concept', description: null, properties: null },
          ],
          edges: [
            { id: 'e1', fromId: '1', toId: '2', relationType: 'works_on', weight: 5, properties: null },
          ],
          totalWeight: 5,
          hopCount: 1,
        },
      };

      const explanation = explainRetrievalPath(result);
      expect(explanation).toContain('both');
      expect(explanation).toContain('Alice');
      expect(explanation).toContain('92.1');
    });
  });
});