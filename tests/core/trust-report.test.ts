import { describe, expect, it } from 'bun:test';
import {
  formatContextReport,
  formatHealthReport,
  formatInspectReport,
  formatStatsReport,
} from '../../core/runtime/trust-report.js';

describe('trust-report', () => {
  it('formats context with canonical current project and other projects', () => {
    const output = formatContextReport({
      currentProject: {
        id: 'proj-1',
        name: 'squish',
        path: '/workspace/squish',
        resolution: 'explicit',
      },
      otherProjects: [{ id: 'proj-2', name: 'dot', path: '.', resolution: 'auto-created' }],
      runtime: {
        sessionSummary: 'Hypotheses: ranking regression',
        activePlaces: ['WIP', 'Board'],
        signalSummary: { captured: 4, suppressed: 2, sessionOnly: 1, durable: 2, durableWithRaw: 1 },
        graphSummary: 'enabled; 3 recent enrichments',
      },
      durableMemories: [{ id: 'm1', type: 'decision', content: 'Use SQLite locally', place: 'Board' }],
      nextStep: null,
    });

    expect(output).toContain('Current project');
    expect(output).toContain('/workspace/squish');
    expect(output).toContain('Other projects');
    expect(output).toContain('WIP');
    expect(output).toContain('Use SQLite locally');
  });

  it('formats health with severity and next step', () => {
    const output = formatHealthReport({
      severity: 'degraded',
      currentProject: 'squish',
      checks: [
        { name: 'database', status: 'ok', detail: 'SQLite reachable' },
        { name: 'places', status: 'degraded', detail: 'No populated places yet' },
      ],
      diagnostics: [
        { name: 'cli binaries', status: 'ok', detail: 'All binaries present' },
      ],
      nextStep: 'Run a memory write or open an existing project to populate places.',
    });

    expect(output).toContain('Status: degraded');
    expect(output).toContain('database: ok');
    expect(output).toContain('places: degraded');
    expect(output).toContain('Diagnostics');
    expect(output).toContain('Next step');
  });

  it('formats stats around product value instead of raw counts only', () => {
    const output = formatStatsReport({
      currentProject: 'squish',
      totals: { memories: 4, durable: 3, sessionLocal: 1 },
      signal: {
        captured: 8,
        suppressed: 3,
        sessionOnly: 2,
        durable: 4,
        durableWithRaw: 2,
        tokensSaved: 190,
        placeRouted: 4,
        graphEnriched: 3,
      },
      places: { active: 2, named: ['WIP', 'Sandbox'] },
      graph: { status: 'enabled', enrichments: 3 },
      wakeUp: 'Working set available',
      signalNote: 'Signal counts cover capture-era writes only.',
    });

    expect(output).toContain('Current project: squish');
    expect(output).toContain('Capture-era signals');
    expect(output).toContain('place routed');
    expect(output).toContain('graph enriched');
    expect(output).toContain('Signal note');
    expect(output).toContain('Wake-up');
  });

  it('formats inspect as a trust anchor', () => {
    const output = formatInspectReport({
      id: 'mem-1',
      classification: 'durable-raw+distilled',
      storageReason: 'test failure with stack trace',
      durability: 'durable',
      place: 'Sandbox',
      placeType: 'sandbox',
      graphStatus: 'enriched (2 entities, 1 relation)',
      rawFallback: 'snap-1',
      wakeUpPriority: 'high',
      metadataAvailability: 'Signal metadata available.',
    });

    expect(output).toContain('mem-1');
    expect(output).toContain('durable-raw+distilled');
    expect(output).toContain('Sandbox');
    expect(output).toContain('snap-1');
    expect(output).toContain('Wake-up priority');
    expect(output).toContain('Metadata');
  });
});
