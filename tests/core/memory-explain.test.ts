import { describe, expect, it } from 'bun:test';
import { summarizeInspection } from '../../core/memory/explain.js';

describe('memory explain', () => {
  it('summarizes classification, reasons, and raw fallback presence', () => {
    const summary = summarizeInspection({
      id: 'mem-1',
      type: 'fact',
      classification: 'durable-raw+distilled',
      reasons: ['test failure', 'stack trace retained in fallback'],
      rawFallbackSnapshotId: 'snap-1',
      nuanceSuppressed: true,
      place: 'Sandbox',
      placeType: 'sandbox',
      graphStatus: 'enriched (2 entities, 1 relation)',
      content: 'FAIL tests/core/foo.test.ts',
    });

    expect(summary).toContain('durable-raw+distilled');
    expect(summary).toContain('snap-1');
    expect(summary).toContain('nuance suppressed');
    expect(summary).toContain('Sandbox');
    expect(summary).toContain('enriched');
  });
});
