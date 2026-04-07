/**
 * Benchmark Pipeline Runner - Local LLM Version
 * 
 * Uses real local models (Qwen, Phi) via Ollama or HuggingFace
 * No mocks, no fallbacks
 */

import chalk from 'chalk';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type { RunConfig, RunCheckpoint, QuestionResult, BenchmarkReport } from '../types/index.js';
import { loadBenchmark } from '../benchmarks/index.js';
import { createLocalProvider } from '../providers/local-llm.js';

const RUNS_DIR = process.env.RUNS_DIR || './data/runs';

interface LocalRunConfig extends RunConfig {
  localModel: string;
  useOllama: boolean;
}

export async function runBenchmarkLocal(config: LocalRunConfig): Promise<BenchmarkReport> {
  const runId = config.runId || `run-local-${Date.now()}`;
  const checkpointPath = join(RUNS_DIR, runId, 'checkpoint.json');

  mkdirSync(join(RUNS_DIR, runId, 'results'), { recursive: true });

  console.log(chalk.blue(`\nUsing local model: ${config.localModel}\n`));

  // Initialize local LLM provider
  const provider = createLocalProvider(config.localModel, config.useOllama);
  
  // Test model availability
  try {
    console.log('Testing model availability...');
    const testResponse = await provider.generateAnswer('test', []);
    console.log(chalk.green('✓ Model is ready\n'));
  } catch (error) {
    console.error(chalk.red(`\n✗ Model ${config.localModel} not available`));
    if (config.useOllama) {
      console.error('Make sure Ollama is running and the model is pulled:');
      console.error(`  ollama pull ${config.localModel}`);
    }
    process.exit(1);
  }

  // Load benchmark
  const spinner = ora('Loading benchmark dataset...').start();
  const benchmark = loadBenchmark(config.benchmark);
  spinner.succeed(`Loaded ${config.benchmark}: ${benchmark.questions.length} questions`);

  const checkpoint: RunCheckpoint = {
    runId,
    config,
    status: 'ingesting',
    progress: { 
      total: config.limit > 0 ? Math.min(config.limit, benchmark.questions.length) : benchmark.questions.length,
      completed: 0, 
      failed: 0 
    },
    currentPhase: 'processing',
    completedPhases: ['ingest', 'index'],
    results: [],
    startTime: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
  };

  // Ingest sessions
  console.log(chalk.yellow('Ingesting sessions...'));
  for (const session of benchmark.sessions) {
    await provider.ingest(session);
  }
  console.log(chalk.green(`✓ Ingested ${benchmark.sessions.length} sessions\n`));

  // Process questions
  const questions = benchmark.questions.slice(0, checkpoint.progress.total);
  
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    console.log(chalk.gray(`[${i + 1}/${questions.length}] ${q.question.slice(0, 60)}...`));

    try {
      // Search
      const searchStart = performance.now();
      const context = await provider.search(q.question, { limit: 5 });
      const searchLatency = performance.now() - searchStart;

      // Generate answer with local LLM
      const answerStart = performance.now();
      const answer = await provider.generateAnswer(q.question, context);
      const answerLatency = performance.now() - answerStart;

      // Judge with local LLM
      const evalStart = performance.now();
      const evaluation = await provider.judgeAnswer(answer, q.groundTruth, q.question);
      const evalLatency = performance.now() - evalStart;

      const result: QuestionResult = {
        questionId: q.id,
        question: q.question,
        groundTruth: q.groundTruth,
        retrievedContext: context,
        generatedAnswer: answer,
        evaluation: {
          correct: evaluation.correct,
          score: evaluation.score,
          confidence: 0.8,
          reasoning: evaluation.reasoning,
        },
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
      console.log(`  ${status} Score: ${evaluation.score.toFixed(2)} | ${answer.slice(0, 80)}...`);

    } catch (error) {
      console.error(chalk.red(`  ✗ Failed: ${error}`));
      checkpoint.progress.failed++;
    }

    checkpoint.lastUpdated = new Date().toISOString();
    saveCheckpoint(checkpoint);
  }

  // Complete
  checkpoint.status = 'completed';
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

function saveCheckpoint(checkpoint: RunCheckpoint): void {
  const path = join(RUNS_DIR, checkpoint.runId, 'checkpoint.json');
  mkdirSync(join(RUNS_DIR, checkpoint.runId), { recursive: true });
  writeFileSync(path, JSON.stringify(checkpoint, null, 2));
}

function generateReport(checkpoint: RunCheckpoint): BenchmarkReport {
  const results = checkpoint.results;
  const correct = results.filter(r => r.evaluation.correct).length;
  
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
    byDifficulty: {},
    byType: {},
    results,
  };
}

function printReport(report: BenchmarkReport): void {
  console.log('\n' + chalk.blue.bold('='.repeat(70)));
  console.log(chalk.blue.bold('BENCHMARK REPORT - LOCAL LLM'));
  console.log(chalk.blue.bold('='.repeat(70)));
  console.log(`Model: ${(report.config as any).localModel}`);
  console.log(`Benchmark: ${report.config.benchmark}`);
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

// Simple ora implementation
function ora(text: string) {
  console.log(text);
  return {
    start: () => ({ 
      succeed: (msg: string) => console.log(chalk.green('✓'), msg),
      fail: (msg: string) => console.log(chalk.red('✗'), msg),
    }),
    succeed: (msg: string) => console.log(chalk.green('✓'), msg),
    fail: (msg: string) => console.log(chalk.red('✗'), msg),
  };
}
