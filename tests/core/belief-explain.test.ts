import { describe, expect, it } from 'bun:test';
import { summarizeInspection } from '../../core/memory/explain.js';

describe('belief explain', () => {
  it('includes derived beliefs in inspection summary', () => {
    const summary = summarizeInspection({
      id: 'mem-1',
      type: 'decision',
      classification: 'durable-distilled',
      reasons: ['decision worth durable retention'],
      rawFallbackSnapshotId: null,
      nuanceSuppressed: false,
      place: 'Board',
      placeType: 'board',
      graphStatus: 'enriched (1 entities, 0 relations)',
      content: 'Decision: use SQLite locally because setup is simpler.',
      legacyMetadata: false,
      beliefs: [
        {
          id: 'belief-1',
          type: 'decision',
          statement: 'use SQLite locally',
          status: 'active',
          confidence: 0.84,
          sourceMemoryIds: ['mem-1'],
          reason: 'setup is simpler',
        },
      ],
    });

    expect(summary).toContain('Beliefs');
    expect(summary).toContain('use SQLite locally');
    expect(summary).toContain('active');
  });
});
