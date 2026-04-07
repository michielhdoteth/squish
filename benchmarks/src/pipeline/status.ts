/**
 * Run Status and Failure Inspection
 */

import chalk from 'chalk';
import { readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import type { RunCheckpoint, QuestionResult } from '../types/index.js';

const RUNS_DIR = process.env.RUNS_DIR || './data/runs';

export async function showStatus(runId: string): Promise<void> {
  const checkpointPath = join(RUNS_DIR, runId, 'checkpoint.json');

  if (!existsSync(checkpointPath)) {
    console.error(chalk.red(`Run ${runId} not found`));
    return;
  }

  const checkpoint: RunCheckpoint = JSON.parse(readFileSync(checkpointPath, 'utf-8'));

  console.log(chalk.blue.bold(`\nRun: ${runId}`));
  console.log('-'.repeat(50));
  console.log('Status:', getStatusColor(checkpoint.status, checkpoint.status));
  console.log('Current Phase:', checkpoint.currentPhase);
  console.log('Completed Phases:', checkpoint.completedPhases.join(', ') || 'none');
  console.log('');
  console.log('Progress:');
  console.log(`  Total: ${checkpoint.progress.total}`);
  console.log(`  Completed: ${chalk.green(checkpoint.progress.completed.toString())}`);
  console.log(`  Failed: ${chalk.red(checkpoint.progress.failed.toString())}`);
  console.log(`  Progress: ${((checkpoint.progress.completed / checkpoint.progress.total) * 100).toFixed(1)}%`);
  console.log('');
  console.log('Start Time:', new Date(checkpoint.startTime).toLocaleString());
  console.log('Last Updated:', new Date(checkpoint.lastUpdated).toLocaleString());

  if (checkpoint.results.length > 0) {
    const correct = checkpoint.results.filter(r => r.evaluation.correct).length;
    const accuracy = checkpoint.results.length > 0 ? correct / checkpoint.results.length : 0;
    console.log('');
    console.log(chalk.yellow('Current Accuracy:'), `${(accuracy * 100).toFixed(1)}%`);
  }
}

export async function showFailures(runId: string): Promise<void> {
  const resultsDir = join(RUNS_DIR, runId, 'results');

  if (!existsSync(resultsDir)) {
    console.error(chalk.red(`No results found for run ${runId}`));
    return;
  }

  const files = readdirSync(resultsDir).filter(f => f.endsWith('.json'));
  const failures: QuestionResult[] = [];

  for (const file of files) {
    const result: QuestionResult = JSON.parse(readFileSync(join(resultsDir, file), 'utf-8'));
    if (!result.evaluation.correct) {
      failures.push(result);
    }
  }

  console.log(chalk.blue.bold(`\nFailed Questions: ${failures.length}`));
  console.log('='.repeat(70));

  for (const failure of failures) {
    console.log(chalk.red.bold(`\n❌ ${failure.questionId}`));
    console.log('Question:', failure.question);
    console.log(chalk.green('Ground Truth:'), failure.groundTruth);
    console.log(chalk.yellow('Generated:'), failure.generatedAnswer);
    console.log(chalk.gray('Reasoning:'), failure.evaluation.reasoning);
    console.log('Score:', failure.evaluation.score.toFixed(2));
    console.log('-'.repeat(70));
  }
}

function getStatusColor(status: string, text: string): string {
  switch (status) {
    case 'completed':
      return chalk.green(text);
    case 'failed':
      return chalk.red(text);
    case 'pending':
      return chalk.gray(text);
    default:
      return chalk.yellow(text);
  }
}
