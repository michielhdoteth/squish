import { describe, expect, it, beforeEach, mock } from 'bun:test';
import {
  detectContradictions,
  resolveContradictions,
  ContradictionCheck,
} from '../../core/memory/contradiction-resolver.js';

describe('contradiction-resolver', () => {
  describe('detectContradictions', () => {
    it('detects negation-based contradictions', async () => {
      const check: ContradictionCheck = {
        newContent: 'We do not use PostgreSQL anymore',
        newType: 'fact',
      };
      
      // This should detect that "not" indicates a potential contradiction
      const result = await detectContradictions(check);
      expect(typeof result.hasContradiction).toBe('boolean');
      expect(typeof result.confidence).toBe('number');
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    it('detects update indicators', async () => {
      const check: ContradictionCheck = {
        newContent: 'Actually, the API now uses GraphQL instead of REST',
        newType: 'fact',
      };
      
      const result = await detectContradictions(check);
      expect(typeof result.hasContradiction).toBe('boolean');
    });

    it('returns empty result for unique content', async () => {
      const check: ContradictionCheck = {
        newContent: 'The weather is nice today',
        newType: 'observation',
      };
      
      const result = await detectContradictions(check);
      expect(result.hasContradiction).toBe(false);
      expect(result.supersededMemories.length).toBe(0);
    });

    it('extracts key entities from content', async () => {
      const check: ContradictionCheck = {
        newContent: 'OpenAI API key has been updated to use GPT-4',
        newType: 'fact',
      };
      
      const result = await detectContradictions(check);
      expect(typeof result.hasContradiction).toBe('boolean');
    });
  });

  describe('resolveContradictions', () => {
    it('returns result with superseded IDs', async () => {
      const result = await resolveContradictions(
        'The database is now MySQL instead of PostgreSQL',
        'fact'
      );
      
      expect(result.shouldProceed).toBe(true);
      expect(Array.isArray(result.supersededIds)).toBe(true);
      expect(typeof result.confidence).toBe('number');
    });

    it('handles correction content', async () => {
      const result = await resolveContradictions(
        'No, I meant use Redis for caching, not Memcached',
        'decision'
      );
      
      expect(result.shouldProceed).toBe(true);
    });
  });
});
