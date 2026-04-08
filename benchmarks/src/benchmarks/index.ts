/**
 * Benchmark Dataset Registry
 */

import { loadLoCoMo } from './locomo.js';
import { loadLongMemEval } from './longmemeval.js';
import { loadConvoMem } from './convomem.js';
import type { BenchmarkDataset } from '../types/index.js';

export const benchmarks = {
  locomo: loadLoCoMo,
  longmemeval: loadLongMemEval,
  convomem: loadConvoMem,
};

export type BenchmarkName = keyof typeof benchmarks;

export function loadBenchmark(name: string): BenchmarkDataset {
  const loader = benchmarks[name as BenchmarkName];
  if (!loader) {
    throw new Error(`Unknown benchmark: ${name}. Available: ${Object.keys(benchmarks).join(', ')}`);
  }
  return loader();
}

export function listBenchmarks(): string[] {
  return Object.keys(benchmarks);
}

export { loadLoCoMo, loadLongMemEval, loadConvoMem };
