import { describe, expect, it } from 'bun:test';
import { extractBeliefsFromMemory } from '../../core/beliefs/extractor.js';

describe('belief extractor', () => {
  it('extracts a decision belief from durable memory', () => {
    const beliefs = extractBeliefsFromMemory({
      memoryId: 'mem-1',
      content: 'Decision: use SQLite locally because setup is simpler.',
      type: 'decision',
      metadata: {},
    });

    expect(beliefs).toHaveLength(1);
    expect(beliefs[0].type).toBe('decision');
    expect(beliefs[0].statement).toContain('use SQLite locally');
    expect(beliefs[0].reason).toContain('setup is simpler');
  });

  it('extracts preference with reason', () => {
    const beliefs = extractBeliefsFromMemory({
      memoryId: 'mem-2',
      content: 'User prefers TypeScript because it catches mistakes earlier.',
      type: 'preference',
      metadata: {},
    });

    expect(beliefs[0].type).toBe('preference');
    expect(beliefs[0].reason).toContain('catches mistakes earlier');
  });

  it('extracts failure cause and dispute beliefs', () => {
    const beliefs = extractBeliefsFromMemory({
      memoryId: 'mem-3',
      content: 'The sync job failed because the rate limiter blocked the retry. Reject increasing the timeout; that is a bandaid.',
      type: 'observation',
      metadata: {},
    });

    expect(beliefs.some((belief) => belief.type === 'failure_cause')).toBe(true);
    expect(beliefs.some((belief) => belief.type === 'dispute')).toBe(true);
  });

  it('extracts state changes', () => {
    const beliefs = extractBeliefsFromMemory({
      memoryId: 'mem-4',
      content: 'System state changed from cold start to hydrated after session restore.',
      type: 'context',
      metadata: {},
    });

    expect(beliefs[0].type).toBe('state_change');
    expect(beliefs[0].statement).toContain('cold start');
  });

  it('skips generic low-signal durable memory', () => {
    const beliefs = extractBeliefsFromMemory({
      memoryId: 'mem-5',
      content: 'Edited some files and checked logs.',
      type: 'observation',
      metadata: {},
    });

    expect(beliefs).toHaveLength(0);
  });
});
