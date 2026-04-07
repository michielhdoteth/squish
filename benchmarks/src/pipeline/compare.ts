/**
 * Multi-Benchmark Comparison
 */

import chalk from 'chalk';
import { table } from 'table';
import { runBenchmark } from './runner.js';
import type { RunConfig, BenchmarkReport } from '../types/index.js';

interface CompareOptions {
  provider: string;
  benchmarks: string[];
  sampleSize: number;
  judge: string;
}

export async function compareBenchmarks(options: CompareOptions): Promise<void> {
  console.log(chalk.blue(`Comparing ${options.benchmarks.length} benchmarks`));
  console.log(`Sample size: ${options.sampleSize} questions per benchmark\n`);

  const results: Array<{ benchmark: string; report: BenchmarkReport }> = [];

  for (const benchmark of options.benchmarks) {
    console.log(chalk.yellow(`\nRunning ${benchmark}...`));
    
    const config: RunConfig = {
      provider: options.provider,
      benchmark,
      judge: options.judge,
      answeringModel: 'gpt-4o',
      runId: `compare-${benchmark}-${Date.now()}`,
      limit: options.sampleSize,
    };

    try {
      const report = await runBenchmark(config);
      results.push({ benchmark, report });
    } catch (error) {
      console.error(chalk.red(`Failed to run ${benchmark}:`), error);
    }
  }

  // Print comparison table
  printComparisonTable(results);
}

function printComparisonTable(results: Array<{ benchmark: string; report: BenchmarkReport }>): void {
  console.log('\n' + chalk.blue.bold('='.repeat(70)));
  console.log(chalk.blue.bold('COMPARISON RESULTS'));
  console.log(chalk.blue.bold('='.repeat(70)));

  const data = [
    ['Benchmark', 'Accuracy', 'Correct', 'Total', 'Avg Latency', 'Time'],
    ...results.map(({ benchmark, report }) => [
      benchmark,
      `${(report.summary.accuracy * 100).toFixed(1)}%`,
      report.summary.correct.toString(),
      report.summary.totalQuestions.toString(),
      `${report.summary.avgLatency.toFixed(0)}ms`,
      `${(report.summary.totalTime / 1000).toFixed(1)}s`,
    ]),
  ];

  console.log(table(data));

  // Find best performer
  const best = results.reduce((best, current) => 
    current.report.summary.accuracy > best.report.summary.accuracy ? current : best
  );

  console.log(chalk.green(`\nBest performer: ${best.benchmark} (${(best.report.summary.accuracy * 100).toFixed(1)}%)`));
}
