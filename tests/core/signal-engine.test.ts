import { describe, expect, it } from 'bun:test';
import {
  classifySignalEvent,
  distillSignalEvent,
  shouldReturnRawFallback,
} from '../../core/ingestion/signal-engine.js';

describe('signal-engine', () => {
  it('suppresses install noise', () => {
    const decision = classifySignalEvent({
      toolName: 'Bash',
      toolInput: { command: 'npm install' },
      toolResult: 'added 842 packages in 31s\nfunding notice\nprogress bar...',
      sessionId: 'session-1',
    });

    expect(decision.classification).toBe('discard');
    expect(decision.storeRaw).toBe(false);
    expect(decision.reasons.join(' ')).toContain('noise');
  });

  it('keeps failed test output as durable distilled memory with raw fallback', () => {
    const decision = classifySignalEvent({
      toolName: 'Bash',
      toolInput: { command: 'bun test tests/core/signal-engine.test.ts' },
      toolResult: 'FAIL tests/core/signal-engine.test.ts\nAssertionError: expected 1 to be 2\nstack trace...',
      sessionId: 'session-1',
    });

    expect(decision.classification).toBe('durable-raw+distilled');
    expect(decision.storeRaw).toBe(true);
    expect(decision.reasons.join(' ')).toContain('test');
    expect(decision.placeHint.placeType).toBe('sandbox');
    expect(decision.graphHint.shouldEnrich).toBe(true);
  });

  it('promotes user corrections to durable distilled memory', () => {
    const decision = classifySignalEvent({
      toolName: 'Task',
      toolInput: { description: 'Correction from user' },
      toolResult: 'Correction: use SQLite locally, not Postgres, for default mode.',
      sessionId: 'session-1',
    });

    expect(decision.classification).toBe('durable-distilled');
    expect(decision.storeRaw).toBe(false);
    expect(decision.wakeUpPriority).toBe('high');
  });

  it('keeps active hypothesis as session-only', () => {
    const decision = classifySignalEvent({
      toolName: 'Task',
      toolInput: { description: 'Investigate failing search ranking' },
      toolResult: 'Current hypothesis: ranking regression is caused by stale recency weighting.',
      sessionId: 'session-1',
    });

    expect(decision.classification).toBe('session-only');
    expect(decision.placeHint.placeType).toBe('board');
    expect(decision.graphHint.shouldEnrich).toBe(false);
  });

  it('emits wip place hints for code edits and graph entities from content', () => {
    const decision = classifySignalEvent({
      toolName: 'Edit',
      toolInput: { path: 'core/memory/memories.ts' },
      toolResult: 'Edited memory ranking in core/memory/memories.ts to fix graph boost ordering for SearchResult.',
      sessionId: 'session-1',
    });

    expect(decision.classification).toBe('durable-distilled');
    expect(decision.placeHint.placeType).toBe('wip');
    expect(decision.graphHint.shouldEnrich).toBe(true);
    expect(decision.graphHint.entityTerms).toContain('SearchResult');
  });

  it('distills test failure output down to the signal', () => {
    const distilled = distillSignalEvent({
      toolName: 'Bash',
      command: 'bun test',
      content:
        'PASS setup\nFAIL tests/core/foo.test.ts\nAssertionError: expected "a" to be "b"\n at foo.ts:12:3\n10 passing',
      classification: 'durable-raw+distilled',
    });

    expect(distilled).toContain('FAIL tests/core/foo.test.ts');
    expect(distilled).toContain('AssertionError');
    expect(distilled).not.toContain('10 passing');
  });

  it('returns raw fallback only when explicitly requested or nuance was suppressed', () => {
    expect(
      shouldReturnRawFallback({
        query: 'show original stack trace',
        hasRawFallback: true,
        nuanceSuppressed: false,
      })
    ).toBe(true);

    expect(
      shouldReturnRawFallback({
        query: 'summarize recent fixes',
        hasRawFallback: true,
        nuanceSuppressed: false,
      })
    ).toBe(false);

    expect(
      shouldReturnRawFallback({
        query: 'summarize recent fixes',
        hasRawFallback: true,
        nuanceSuppressed: true,
      })
    ).toBe(true);
  });
});
