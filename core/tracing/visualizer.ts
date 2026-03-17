/** Trace Visualizer - Creates ASCII visualizations of search traces
 *
 * Provides tree-format output showing search pipeline stages and timing
 */

import { logger } from '../logger.js';
import { SearchTrace } from './collector.js';

/**
 * Create visual ASCII visualization of a trace
 */
export function visualizeTrace(trace: SearchTrace): string {
  const lines: string[] = [];

  // Header
  lines.push('='.repeat(60));
  lines.push(`Search Trace: ${trace.id}`);
  lines.push(`Session: ${trace.sessionId || 'N/A'}`);
  lines.push(`Query: "${trace.query}"`);
  lines.push('='.repeat(60));
  lines.push('');

  // Total duration
  lines.push(`Total Duration: ${trace.totalDurationMs}ms (${(trace.totalDurationMs / 1000).toFixed(2)}s)`);
  lines.push('');

  // Stage timeline visualization
  lines.push('─'.repeat(60));
  lines.push('Pipeline Stages:');
  lines.push('─'.repeat(60));
  lines.push('');

  const stageNames: string[] = [];
  const stageTimings: number[] = [];

  if (trace.queryRewrite) {
    stageNames.push('Query Rewrite');
    stageTimings.push(trace.queryRewrite.timeMs || 0);
  }
  if (trace.candidateRetrieval) {
    stageNames.push('Candidate Retrieval');
    stageTimings.push(trace.candidateRetrieval.timeMs || 0);
  }
  if (trace.entityFiltering) {
    stageNames.push('Entity Filtering');
    stageTimings.push(trace.entityFiltering.timeMs || 0);
  }
  if (trace.hybridScoring) {
    stageNames.push('Hybrid Scoring');
    stageTimings.push(trace.hybridScoring.timeMs || 0);
  }
  if (trace.reranking) {
    stageNames.push('Reranking');
    stageTimings.push(trace.reranking.timeMs || 0);
  }

  if (stageNames.length > 0) {
    let cumulativeTime = 0;
    const maxStageNameLength = Math.max(...stageNames.map(n => n.length));

    stageNames.forEach((name, i) => {
      const duration = stageTimings[i] || 0;
      cumulativeTime += duration;
      const progressPercent = ((cumulativeTime / trace.totalDurationMs) * 100).toFixed(1);
      const barLength = Math.max(0, Math.min(40, Math.round((duration / trace.totalDurationMs) * 40)));

      // Stage name with timing
      const paddedName = name.padEnd(maxStageNameLength + 2);
      lines.push(`${paddedName} │ ${duration.toString().padStart(4)}ms │ ${progressPercent.padStart(5)}%`);

      // Visualization bar
      const bar = '█'.repeat(barLength) + '░'.repeat(40 - barLength);
      lines.push(`           └─ ${bar}`);

      lines.push('');
    });
  } else {
    lines.push('  No stage data available');
    lines.push('');
  }

  // Top results
  if (trace.topResults && trace.topResults.length > 0) {
    lines.push('─'.repeat(60));
    lines.push(`Top Results (${trace.topResults.length}):`);
    lines.push('─'.repeat(60));
    lines.push('');

    trace.topResults.slice(0, 5).forEach((result, i) => {
      const type = result.type || 'memory';
      const content = result.content?.substring(0, 60) || '';
      const score = result.hybridScore?.toFixed(2) || 'N/A';
      lines.push(`${(i + 1).toString().padStart(2)}. [${type.padEnd(8)}] (score: ${score})`);
      if (content.length > 0) {
        lines.push(`    ${content}`);
      }
      lines.push('');
    });
  } else if (trace.resultCount !== undefined) {
    lines.push('─'.repeat(60));
    lines.push(`Results: ${trace.resultCount} returned`);
    lines.push('─'.repeat(60));
    lines.push('');
  }

  // Footer
  lines.push('='.repeat(60));
  lines.push('');

  return lines.join('\n');
}

/**
 * Create compact single-line trace summary
 */
export function summarizeTrace(trace: SearchTrace): string {
  const parts: string[] = [];

  parts.push(`[${trace.id.substring(0, 8)}]`);
  parts.push(`"${trace.query.substring(0, 30)}${trace.query.length > 30 ? '...' : ''}"`);
  parts.push(`${trace.totalDurationMs}ms`);
  parts.push(trace.resultCount !== undefined ? `${trace.resultCount} results` : 'unknown');

  return parts.join(' | ');
}

/**
 * Compare multiple traces
 */
export function compareTraces(traces: SearchTrace[]): string {
  const lines: string[] = [];

  lines.push('─'.repeat(80));
  lines.push('Trace Comparison');
  lines.push('─'.repeat(80));
  lines.push('');
  lines.push('ID'.padEnd(10) + ' | ' + 'Query'.padEnd(30) + ' | ' + 'Duration'.padEnd(10) + ' | ' + 'Results');
  lines.push('─'.repeat(80));

  traces.forEach(trace => {
    const id = trace.id.substring(0, 8);
    const query = trace.query.substring(0, 30);
    const duration = `${trace.totalDurationMs}ms`;
    const results = trace.resultCount !== undefined ? trace.resultCount.toString() : '?';
    lines.push(`${id.padEnd(10)} | ${query.padEnd(30)} | ${duration.padEnd(10)} | ${results.padEnd(8)}`);
  });

  return lines.join('\n');
}

/**
 * Get stage breakdown table
 */
export function getStageBreakdown(trace: SearchTrace): string {
  const lines: string[] = [];

  lines.push('Stage Timing Breakdown:');
  lines.push('');

  const stages = [
    { name: 'Query Rewrite', data: trace.queryRewrite, timeMs: trace.queryRewrite?.timeMs || 0 },
    { name: 'Candidate Retrieval', data: trace.candidateRetrieval, timeMs: trace.candidateRetrieval?.timeMs || 0 },
    { name: 'Entity Filtering', data: trace.entityFiltering, timeMs: trace.entityFiltering?.timeMs || 0 },
    { name: 'Hybrid Scoring', data: trace.hybridScoring, timeMs: trace.hybridScoring?.timeMs || 0 },
    { name: 'Reranking', data: trace.reranking, timeMs: trace.reranking?.timeMs || 0 },
  ];

  const validStages = stages.filter(s => s.data && s.timeMs !== undefined);

  if (validStages.length > 0) {
    const maxNameLength = Math.max(...validStages.map(s => s.name.length));

    validStages.forEach(stage => {
      const percentage = ((stage.timeMs / trace.totalDurationMs) * 100).toFixed(1);
      lines.push(`  ${stage.name.padEnd(maxNameLength)} │ ${stage.timeMs.toString().padStart(4)}ms │ ${percentage.padStart(5)}%`);
    });

    lines.push('');
    lines.push('  ' + '─'.repeat(maxNameLength + 4 + 5 + 6));
  } else {
    lines.push('  No stage timing data available');
  }

  return lines.join('\n');
}

/**
 * Export all visualizer functions
 */
export default {
  visualizeTrace,
  summarizeTrace,
  compareTraces,
  getStageBreakdown,
};
