/**
 * Benchmark Pipeline Runner
 * 
 * Pipeline: INGEST → INDEX → SEARCH → ANSWER → EVALUATE → REPORT
 */

import chalk from 'chalk';
import ora from 'ora';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type { RunConfig, RunCheckpoint, QuestionResult, BenchmarkReport } from '../types/index.js';
import { loadBenchmark } from '../benchmarks/index.js';
import { createSquishProvider } from '../providers/squish.js';
import { createJudge } from '../judges/index.js';
import { generateAnswer } from './answer.js';

const RUNS_DIR = process.env.RUNS_DIR || './data/runs';

export async function runBenchmark(config: RunConfig): Promise<BenchmarkReport> {
  const runId = config.runId || `run-${Date.now()}`;
  const checkpointPath = join(RUNS_DIR, runId, 'checkpoint.json');

  // Ensure runs directory exists
  mkdirSync(join(RUNS_DIR, runId, 'results'), { recursive: true });

  // Check for existing checkpoint
  let checkpoint: RunCheckpoint | null = null;
  if (existsSync(checkpointPath) && !config.force) {
    checkpoint = JSON.parse(readFileSync(checkpointPath, 'utf-8'));
    console.log(chalk.yellow(`Resuming run: ${runId} (phase: ${checkpoint?.status})`));
  }

  // Initialize checkpoint if needed
  if (!checkpoint) {
    checkpoint = {
      runId,
      config: { ...config, runId },
      status: 'pending',
      progress: { total: 0, completed: 0, failed: 0 },
      currentPhase: 'initializing',
      completedPhases: [],
      results: [],
      startTime: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
    };
  }

  // Load benchmark data
  const spinner = ora('Loading benchmark dataset...').start();
  const benchmark = loadBenchmark(config.benchmark);
  checkpoint.progress.total = config.limit > 0 
    ? Math.min(config.limit, benchmark.questions.length)
    : benchmark.questions.length;
  spinner.succeed(`Loaded ${config.benchmark}: ${benchmark.questions.length} questions`);

  // Initialize provider
  const provider = createSquishProvider();
  const judge = createJudge(config.judge);

  // Phase 1: INGEST
  if (!checkpoint.completedPhases.includes('ingest')) {
    await runPhase('ingest', async () => {
      for (const session of benchmark.sessions) {
        await provider.ingest(session);
      }
    }, checkpoint);
  }

  // Phase 2: INDEX
  if (!checkpoint.completedPhases.includes('index')) {
    await runPhase('index', async () => {
      await provider.index();
    }, checkpoint);
  }

  // Phase 3: SEARCH → ANSWER → EVALUATE
  const questions = benchmark.questions.slice(0, checkpoint.progress.total);
  
  for (let i = checkpoint.results.length; i < questions.length; i++) {
    const q = questions[i];
    checkpoint.currentPhase = `processing-${q.id}`;
    checkpoint.status = 'searching';
    
    console.log(chalk.gray(`\n[${i + 1}/${questions.length}] Processing: ${q.question.slice(0, 60)}...`));

    try {
      // SEARCH
      const searchStart = performance.now();
      const context = await provider.search(q.question, { limit: 5 });
      const searchLatency = performance.now() - searchStart;

      // ANSWER
      const answerStart = performance.now();
      const answer = await generateAnswer(q.question, context, config.answeringModel);
      const answerLatency = performance.now() - answerStart;

      // EVALUATE
      const evalStart = performance.now();
      const evaluation = await judge.evaluate(answer, q.groundTruth, q.question);
      const evalLatency = performance.now() - evalStart;

      const result: QuestionResult = {
        questionId: q.id,
        question: q.question,
        groundTruth: q.groundTruth,
        retrievedContext: context,
        generatedAnswer: answer,
        evaluation,
        latency: {
          search: searchLatency,
          answer: answerLatency,
          evaluate: evalLatency,
        },
      };

      checkpoint.results.push(result);
      checkpoint.progress.completed++;

      // Save result
      writeFileSync(
        join(RUNS_DIR, runId, 'results', `${q.id}.json`),
        JSON.stringify(result, null, 2)
      );

      const status = evaluation.correct ? chalk.green('✓') : chalk.red('✗');
      console.log(`${status} Score: ${evaluation.score.toFixed(2)} | Correct: ${evaluation.correct}`);

    } catch (error) {
      console.error(chalk.red(`Failed to process ${q.id}:`), error);
      checkpoint.progress.failed++;
    }

    checkpoint.lastUpdated = new Date().toISOString();
    saveCheckpoint(checkpoint);
  }

  // Phase 6: REPORT
  checkpoint.status = 'completed';
  checkpoint.completedPhases.push('report');
  checkpoint.lastUpdated = new Date().toISOString();
  saveCheckpoint(checkpoint);

  const report = generateReport(checkpoint);
  writeFileSync(
    join(RUNS_DIR, runId, 'report.json'),
    JSON.stringify(report, null, 2)
  );

  printReport(report);
  return report;
}

async function runPhase(
  phase: string,
  fn: () => Promise<void>,
  checkpoint: RunCheckpoint
): Promise<void> {
  const spinner = ora(`${phase.toUpperCase()}...`).start();
  checkpoint.currentPhase = phase;
  checkpoint.status = phase as any;
  
  try {
    await fn();
    checkpoint.completedPhases.push(phase);
    spinner.succeed(`${phase.toUpperCase()} completed`);
  } catch (error) {
    checkpoint.status = 'failed';
    spinner.fail(`${phase.toUpperCase()} failed: ${error}`);
    throw error;
  }
  
  saveCheckpoint(checkpoint);
}

function saveCheckpoint(checkpoint: RunCheckpoint): void {
  const path = join(RUNS_DIR, checkpoint.runId, 'checkpoint.json');
  mkdirSync(join(RUNS_DIR, checkpoint.runId), { recursive: true });
  writeFileSync(path, JSON.stringify(checkpoint, null, 2));
}

function generateReport(checkpoint: RunCheckpoint): BenchmarkReport {
  const results = checkpoint.results;
  const correct = results.filter(r => r.evaluation.correct).length;
  
  const byDifficulty: Record<string, { accuracy: number; count: number }> = {};
  const byType: Record<string, { accuracy: number; count: number }> = {};

  // Group by difficulty and type would require access to question metadata
  // For now, calculate overall stats

  const avgLatency = results.length > 0
    ? results.reduce((sum, r) => sum + r.latency.search + r.latency.answer, 0) / results.length
    : 0;

  const startTime = new Date(checkpoint.startTime).getTime();
  const endTime = new Date(checkpoint.lastUpdated).getTime();

  return {
    runId: checkpoint.runId,
    config: checkpoint.config,
    summary: {
      totalQuestions: checkpoint.progress.total,
      answered: checkpoint.progress.completed,
      correct,
      accuracy: checkpoint.progress.completed > 0 ? correct / checkpoint.progress.completed : 0,
      avgLatency,
      totalTime: endTime - startTime,
    },
    byDifficulty,
    byType,
    results,
  };
}

function printReport(report: BenchmarkReport): void {
  console.log('\n' + chalk.blue.bold('='.repeat(70)));
  console.log(chalk.blue.bold('BENCHMARK REPORT'));
  console.log(chalk.blue.bold('='.repeat(70)));
  console.log(`Run ID: ${report.runId}`);
  console.log(`Provider: ${report.config.provider}`);
  console.log(`Benchmark: ${report.config.benchmark}`);
  console.log(`Judge: ${report.config.judge}`);
  console.log('');
  console.log(chalk.yellow.bold('SUMMARY'));
  console.log('-'.repeat(70));
  console.log(`Total Questions: ${report.summary.totalQuestions}`);
  console.log(`Answered: ${report.summary.answered}`);
  console.log(`Correct: ${chalk.green(report.summary.correct.toString())}`);
  console.log(`Accuracy: ${chalk.green((report.summary.accuracy * 100).toFixed(1) + '%')}`);
  console.log(`Avg Latency: ${report.summary.avgLatency.toFixed(0)}ms`);
  console.log(`Total Time: ${(report.summary.totalTime / 1000).toFixed(1)}s`);
  console.log(chalk.blue.bold('='.repeat(70)));
}
