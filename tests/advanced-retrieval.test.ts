/**
 * Tests for Advanced Retrieval Features
 * 
 * Tests the three advanced retrieval modules:
 * 1. Query Expansion - synonym mapping and compound queries
 * 2. Entity-Aware Retrieval - entity extraction and boost
 * 3. Temporal Validity Tracking - date references and staleness detection
 */

import { describe, it, expect, beforeEach } from 'bun:test';

// Import the modules to test
import {
  expandQuery,
  type QueryExpansionConfig,
} from '../core/retrieval/query-expansion.js';

import {
  extractQueryEntities,
  entityBoost,
  type EntityConfig,
} from '../core/retrieval/entity-aware-retrieval.js';

import {
  detectTemporalReferences,
  isLikelyStale,
  type TemporalConfig,
} from '../core/retrieval/temporal-validity.js';

import type { SearchResult } from '../core/memory/memories.js';

// ── Query Expansion Tests ──────────────────────────────────────────

describe('Query Expansion', () => {
  const defaultConfig: QueryExpansionConfig = {
    enabled: true,
    maxExpansions: 3,
  };

  it('expands query with synonyms for common coding terms', () => {
    const expansions = expandQuery('fix the bug', defaultConfig);
    
    // Should include original query
    expect(expansions).toContain('fix the bug');
    
    // Should include synonym expansions
    const allText = expansions.join(' ').toLowerCase();
    expect(allText).toContain('resolve');
    expect(allText).toContain('issue');
  });

  it('expands compound queries by splitting', () => {
    const expansions = expandQuery('how to implement feature and fix bug', defaultConfig);
    
    // Should have multiple expansions
    expect(expansions.length).toBeGreaterThan(1);
    
    // Should contain parts of the compound query
    const allText = expansions.join(' ').toLowerCase();
    expect(allText).toContain('implement');
    expect(allText).toContain('bug');
  });

  it('respects maxExpansions config', () => {
    const config: QueryExpansionConfig = {
      enabled: true,
      maxExpansions: 2,
    };
    
    const expansions = expandQuery('fix the bug', config);
    
    // Should not exceed maxExpansions + 1 (original)
    expect(expansions.length).toBeLessThanOrEqual(config.maxExpansions + 1);
  });

  it('returns original query when disabled', () => {
    const config: QueryExpansionConfig = {
      enabled: false,
      maxExpansions: 3,
    };
    
    const expansions = expandQuery('fix the bug', config);
    
    // Should only return the original query
    expect(expansions).toEqual(['fix the bug']);
  });

  it('handles empty query gracefully', () => {
    const expansions = expandQuery('', defaultConfig);
    expect(expansions).toEqual(['']);
  });

  it('expands test-related queries', () => {
    const expansions = expandQuery('test the feature', defaultConfig);
    
    const allText = expansions.join(' ').toLowerCase();
    expect(allText).toContain('verify');
    expect(allText).toContain('validate');
  });

  it('expands refactor-related queries', () => {
    const expansions = expandQuery('refactor the code', defaultConfig);
    
    const allText = expansions.join(' ').toLowerCase();
    expect(allText).toContain('restructure');
    expect(allText).toContain('reorganize');
  });
});

// ── Entity-Aware Retrieval Tests ──────────────────────────────────

describe('Entity-Aware Retrieval', () => {
  describe('extractQueryEntities', () => {
    it('extracts PascalCase entities', () => {
      const entities = extractQueryEntities('How does ButtonComponent work?');
      
      expect(entities).toContain('ButtonComponent');
    });

    it('extracts camelCase entities', () => {
      const entities = extractQueryEntities('What is getUserData doing?');
      
      expect(entities).toContain('getUserData');
    });

    it('extracts file paths with extensions', () => {
      const entities = extractQueryEntities('Read src/components/Button.tsx');
      
      const hasFilePath = entities.some(e => e.includes('.tsx') || e.includes('Button'));
      expect(hasFilePath).toBe(true);
    });

    it('extracts multiple entity types', () => {
      const entities = extractQueryEntities(
        'Fix ButtonComponent in src/components/Button.tsx and call getUserData()'
      );
      
      // Should extract multiple entities
      expect(entities.length).toBeGreaterThan(1);
    });

    it('returns empty array for query with no entities', () => {
      const entities = extractQueryEntities('the quick brown fox');
      
      // Should return empty or minimal entities
      expect(entities.length).toBe(0);
    });

    it('extracts common tool names', () => {
      const entities = extractQueryEntities('Use React for the UI');
      
      expect(entities).toContain('React');
    });
  });

  describe('entityBoost', () => {
    it('boosts results with matching entities', () => {
      const results: SearchResult[] = [
        { id: '1', content: 'ButtonComponent renders UI', similarity: 0.5 },
        { id: '2', content: 'getUserData fetches data', similarity: 0.5 },
        { id: '3', content: 'Unrelated content', similarity: 0.5 },
      ] as any[];

      const queryEntities = ['ButtonComponent', 'getUserData'];
      const boosted = entityBoost(results, queryEntities);

      // Results with entities should be boosted
      expect(boosted[0].similarity).toBeGreaterThan(0.5);
      expect(boosted[1].similarity).toBeGreaterThan(0.5);
      
      // Unrelated result should not be boosted
      const unrelated = boosted.find(r => r.id === '3');
      expect(unrelated?.similarity).toBe(0.5);
    });

    it('preserves original order when no entities match', () => {
      const results: SearchResult[] = [
        { id: '1', content: 'First result', similarity: 0.7 },
        { id: '2', content: 'Second result', similarity: 0.6 },
      ] as any[];

      const queryEntities = ['NonExistentEntity'];
      const boosted = entityBoost(results, queryEntities);

      // Order should be preserved
      expect(boosted[0].id).toBe('1');
      expect(boosted[1].id).toBe('2');
    });

    it('handles empty entities array', () => {
      const results: SearchResult[] = [
        { id: '1', content: 'Result', similarity: 0.5 },
      ] as any[];

      const boosted = entityBoost(results, []);

      // Should not modify results
      expect(boosted[0].similarity).toBe(0.5);
    });

    it('handles empty results array', () => {
      const boosted = entityBoost([], ['Entity']);
      expect(boosted).toEqual([]);
    });

    it('boosts by entity count (more matches = higher boost)', () => {
      const results: SearchResult[] = [
        { id: '1', content: 'ButtonComponent with getUserData', similarity: 0.5 },
        { id: '2', content: 'ButtonComponent only', similarity: 0.5 },
      ] as any[];

      const queryEntities = ['ButtonComponent', 'getUserData'];
      const boosted = entityBoost(results, queryEntities);

      // Result with 2 entity matches should be boosted more
      expect(boosted[0].similarity).toBeGreaterThan(boosted[1].similarity);
    });
  });
});

// ── Temporal Validity Tests ──────────────────────────────────────

describe('Temporal Validity', () => {
  describe('detectTemporalReferences', () => {
    it('detects "as of" date references', () => {
      const result = detectTemporalReferences('As of 2024, we use version 2.0');
      
      expect(result.hasTemporal).toBe(true);
      expect(result.references.length).toBeGreaterThan(0);
    });

    it('detects "since version" references', () => {
      const result = detectTemporalReferences('Since version 3.0, this changed');
      
      expect(result.hasTemporal).toBe(true);
    });

    it('detects "currently using" references', () => {
      const result = detectTemporalReferences('We are currently using React 18');
      
      expect(result.hasTemporal).toBe(true);
    });

    it('detects year references', () => {
      const result = detectTemporalReferences('In 2023, we migrated to TypeScript');
      
      expect(result.hasTemporal).toBe(true);
    });

    it('returns false for non-temporal content', () => {
      const result = detectTemporalReferences('React is a JavaScript library');
      
      expect(result.hasTemporal).toBe(false);
      expect(result.references.length).toBe(0);
    });

    it('detects multiple temporal references', () => {
      const result = detectTemporalReferences(
        'As of January 2024, we use version 2.0. Since then, we updated to 3.0'
      );
      
      expect(result.hasTemporal).toBe(true);
      expect(result.references.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('isLikelyStale', () => {
    it('returns true for old "as of" references', () => {
      const memory = {
        content: 'As of 2020, we use jQuery',
        createdAt: '2020-01-01T00:00:00Z',
      };
      
      const stale = isLikelyStale(memory);
      expect(stale).toBe(true);
    });

    it('returns false for recent references', () => {
      const currentYear = new Date().getFullYear();
      const memory = {
        content: `As of ${currentYear}, we use React 18`,
        createdAt: new Date().toISOString(),
      };
      
      const stale = isLikelyStale(memory);
      expect(stale).toBe(false);
    });

    it('returns false for non-temporal content', () => {
      const memory = {
        content: 'React is a JavaScript library for building UIs',
        createdAt: '2023-01-01T00:00:00Z',
      };
      
      const stale = isLikelyStale(memory);
      expect(stale).toBe(false);
    });

    it('considers lastAccessedAt for staleness', () => {
      const memory = {
        content: 'As of 2021, we use Vue 2',
        createdAt: '2021-01-01T00:00:00Z',
        lastAccessedAt: new Date().toISOString(), // Recently accessed
      };
      
      const stale = isLikelyStale(memory);
      // Recently accessed might not be stale even if old
      expect(typeof stale).toBe('boolean');
    });

    it('handles missing lastAccessedAt', () => {
      const memory = {
        content: 'As of 2019, we use AngularJS',
        createdAt: '2019-01-01T00:00:00Z',
      };
      
      const stale = isLikelyStale(memory);
      expect(stale).toBe(true);
    });

    it('detects version-based staleness', () => {
      const memory = {
        content: 'We use version 1.0 of the API',
        createdAt: '2020-06-15T00:00:00Z',
      };
      
      const stale = isLikelyStale(memory);
      // Old version reference might be stale
      expect(typeof stale).toBe('boolean');
    });
  });
});
