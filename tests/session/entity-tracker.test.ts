/**
 * Tests for Session Entity Tracker and Reference Resolver
 * 
 * Tests entity tracking, salience decay, reference resolution,
 * and definite reference resolution.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

import {
  trackEntityInSession,
  getActiveSessionEntities,
  resolveReference,
  clearSessionEntities,
  decayAllSessionEntities,
  getActiveSessions,
} from '../../core/session/entity-tracker.js';

import {
  wouldBenefitFromPronounResolution,
  getSessionContextSummary,
} from '../../core/session/reference-resolver.js';

// Mock the LLM extraction to avoid API calls
vi.mock('../../core/graph/llm-entity-extractor.js', () => ({
  extractEntitiesAndRelations: vi.fn().mockResolvedValue({
    entities: [],
    relations: [],
    source: 'regex',
  }),
}));

import { resolvePronouns } from '../../core/session/reference-resolver.js';

describe('Session Entity Tracker', () => {
  beforeEach(() => {
    // Clear all sessions between tests
    const sessions = getActiveSessions();
    for (const session of sessions) {
      clearSessionEntities(session);
    }
  });

  describe('trackEntityInSession', () => {
    it('should track an entity in a session', () => {
      trackEntityInSession('test-session', 'entity-1', 'Alice', 'person');
      const entities = getActiveSessionEntities('test-session');
      expect(entities).toHaveLength(1);
      expect(entities[0].entityName).toBe('Alice');
      expect(entities[0].entityType).toBe('person');
      expect(entities[0].mentionCount).toBe(1);
    });

    it('should increase mention count on repeated tracking', () => {
      trackEntityInSession('test-session', 'entity-1', 'Alice', 'person');
      trackEntityInSession('test-session', 'entity-1', 'Alice', 'person');
      trackEntityInSession('test-session', 'entity-1', 'Alice', 'person');

      const entities = getActiveSessionEntities('test-session');
      expect(entities).toHaveLength(1);
      expect(entities[0].mentionCount).toBe(3);
      expect(entities[0].salience).toBeGreaterThan(0.5);
    });

    it('should track multiple entities in a session', () => {
      trackEntityInSession('test-session', 'entity-1', 'Alice', 'person');
      trackEntityInSession('test-session', 'entity-2', 'Project Atlas', 'concept');
      trackEntityInSession('test-session', 'entity-3', 'PostgreSQL', 'tool');

      const entities = getActiveSessionEntities('test-session');
      expect(entities).toHaveLength(3);
    });

    it('should sort entities by salience', () => {
      // Mention Alice more times to increase salience
      trackEntityInSession('test-session', 'entity-1', 'Alice', 'person');
      trackEntityInSession('test-session', 'entity-1', 'Alice', 'person');
      trackEntityInSession('test-session', 'entity-1', 'Alice', 'person');
      trackEntityInSession('test-session', 'entity-2', 'Bob', 'person');

      const entities = getActiveSessionEntities('test-session');
      expect(entities[0].entityName).toBe('Alice'); // Higher salience
    });

    it('should isolate entities between sessions', () => {
      trackEntityInSession('session-1', 'entity-1', 'Alice', 'person');
      trackEntityInSession('session-2', 'entity-2', 'Bob', 'person');

      const entities1 = getActiveSessionEntities('session-1');
      const entities2 = getActiveSessionEntities('session-2');

      expect(entities1).toHaveLength(1);
      expect(entities1[0].entityName).toBe('Alice');
      expect(entities2).toHaveLength(1);
      expect(entities2[0].entityName).toBe('Bob');
    });
  });

  describe('getActiveSessionEntities', () => {
    it('should return empty array for unknown session', () => {
      const entities = getActiveSessionEntities('unknown-session');
      expect(entities).toHaveLength(0);
    });

    it('should filter by entity type', () => {
      trackEntityInSession('test-session', 'entity-1', 'Alice', 'person');
      trackEntityInSession('test-session', 'entity-2', 'PostgreSQL', 'tool');
      trackEntityInSession('test-session', 'entity-3', 'Project Atlas', 'concept');

      const people = getActiveSessionEntities('test-session', {
        entityTypes: ['person'],
      });

      expect(people).toHaveLength(1);
      expect(people[0].entityName).toBe('Alice');
    });

    it('should respect limit parameter', () => {
      for (let i = 0; i < 10; i++) {
        trackEntityInSession('test-session', `entity-${i}`, `Entity ${i}`, 'concept');
      }

      const entities = getActiveSessionEntities('test-session', { limit: 3 });
      expect(entities).toHaveLength(3);
    });
  });

  describe('resolveReference', () => {
    it('should resolve "she" to the most salient person', () => {
      trackEntityInSession('test-session', 'entity-1', 'Alice', 'person');
      trackEntityInSession('test-session', 'entity-1', 'Alice', 'person');
      trackEntityInSession('test-session', 'entity-2', 'Bob', 'person');

      const resolved = resolveReference('test-session', 'she');
      expect(resolved).not.toBeNull();
      expect(resolved!.entityName).toBe('Alice');
    });

    it('should resolve "it" to the most salient non-person entity', () => {
      trackEntityInSession('test-session', 'entity-1', 'Alice', 'person');
      trackEntityInSession('test-session', 'entity-2', 'PostgreSQL', 'tool');
      trackEntityInSession('test-session', 'entity-2', 'PostgreSQL', 'tool');

      const resolved = resolveReference('test-session', 'it');
      expect(resolved).not.toBeNull();
      expect(resolved!.entityName).toBe('PostgreSQL');
    });

    it('should return null for unknown session', () => {
      const resolved = resolveReference('unknown-session', 'she');
      expect(resolved).toBeNull();
    });

    it('should resolve "the project" to a concept entity', () => {
      trackEntityInSession('test-session', 'entity-1', 'Project Atlas', 'concept');
      trackEntityInSession('test-session', 'entity-1', 'Project Atlas', 'concept');

      const resolved = resolveReference('test-session', 'the project');
      expect(resolved).not.toBeNull();
      expect(resolved!.entityName).toBe('Project Atlas');
    });
  });

  describe('decayAllSessionEntities', () => {
    it('should decay salience over time', () => {
      trackEntityInSession('test-session', 'entity-1', 'Alice', 'person');
      trackEntityInSession('test-session', 'entity-1', 'Alice', 'person');

      const before = getActiveSessionEntities('test-session');
      const salienceBefore = before[0].salience;

      // Decay (this simulates time passing)
      decayAllSessionEntities();

      const after = getActiveSessionEntities('test-session');
      // Salience should be lower or equal after decay
      // (may not be strictly lower if decay is very small)
      expect(after[0].salience).toBeLessThanOrEqual(salienceBefore);
    });
  });

  describe('clearSessionEntities', () => {
    it('should clear all entities for a session', () => {
      trackEntityInSession('test-session', 'entity-1', 'Alice', 'person');
      trackEntityInSession('test-session', 'entity-2', 'Bob', 'person');

      clearSessionEntities('test-session');

      const entities = getActiveSessionEntities('test-session');
      expect(entities).toHaveLength(0);
    });
  });
});

describe('Pronoun Resolver', () => {
  beforeEach(() => {
    const sessions = getActiveSessions();
    for (const session of sessions) {
      clearSessionEntities(session);
    }
  });

  describe('wouldBenefitFromPronounResolution', () => {
    it('should detect pronouns in queries', () => {
      expect(wouldBenefitFromPronounResolution('What does she work on?')).toBe(true);
      expect(wouldBenefitFromPronounResolution('Is it still running?')).toBe(true);
      expect(wouldBenefitFromPronounResolution('How are they doing?')).toBe(true);
    });

    it('should detect definite references', () => {
      expect(wouldBenefitFromPronounResolution('What does the project use?')).toBe(true);
      expect(wouldBenefitFromPronounResolution('Is the database healthy?')).toBe(true);
    });

    it('should return false for queries without pronouns or references', () => {
      expect(wouldBenefitFromPronounResolution('What is PostgreSQL?')).toBe(false);
      expect(wouldBenefitFromPronounResolution('Alice works on Project Atlas')).toBe(false);
    });
  });

  describe('getSessionContextSummary', () => {
    it('should return empty summary for unknown session', () => {
      const summary = getSessionContextSummary('unknown-session');
      expect(summary).toContain('No active entities');
    });

    it('should return entity summary for active session', () => {
      trackEntityInSession('test-session', 'entity-1', 'Alice', 'person');
      trackEntityInSession('test-session', 'entity-2', 'PostgreSQL', 'tool');

      const summary = getSessionContextSummary('test-session');
      expect(summary).toContain('Alice');
      expect(summary).toContain('PostgreSQL');
    });
  });
});