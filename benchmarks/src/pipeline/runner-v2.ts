/**
 * Benchmark Runner v2 - Real Embeddings + LLM Judge
 */

import chalk from 'chalk';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { RunConfig, RunCheckpoint, QuestionResult, BenchmarkReport } from '../types/index.js';
import { loadBenchmark } from '../benchmarks/index.js';
import { createLocalProviderV2 } from '../providers/local-llm-v2.js';

const RUNS_DIR = process.env.RUNS_DIR || './data/runs';

interface V2RunConfig extends RunConfig {
  model: string;
  embedModel?: string;
}

export async function runBenchmarkV2(config: V2RunConfig): Promise<BenchmarkReport> {
  const runId = config.runId || `run-v2-${Date.now()}`;
  
  console.log(chalk.blue.bold('\n╔════════════════════════════════════════════════════════╗'));
  console.log(chalk.blue.bold('║    SQUISH BENCHMARK v2 - Real Embeddings + LLM       ║'));
  console.log(chalk.blue.bold('╚════════════════════════════════════════════════════════╝\n'));
  
  console.log(chalk.cyan(`Model: ${config.model}`));
  console.log(chalk.cyan(`Embeddings: ${config.embedModel || 'nomic-embed-text'}`));
  console.log(chalk.cyan(`Benchmark: ${config.benchmark}\n`));

  // Check Ollama
  try {
    const res = await fetch('http://localhost:11434/api/tags');
    if (!res.ok) throw new Error('Ollama not responding');
    console.log(chalk.green('✓ Ollama is running'));
  } catch {
    console.error(chalk.red('✗ Ollama not available. Start it first: ollama serve'));
    process.exit(1);
  }

  // Initialize provider
  const provider = createLocalProviderV2(config.model, config.embedModel);
  
  // Test models
  console.log(chalk.yellow('\nTesting models...'));
  try {
    await provider.search('test', { limit: 1 });
    console.log(chalk.green(`✓ Embedding model ready (${config.embedModel || 'nomic-embed-text'})`));
  } catch (e: any) {
    if (e.message.includes('not found')) {
      console.error(chalk.red(`\n✗ Embedding model not found. Run: ollama pull ${config.embedModel || 'nomic-embed-text'}`));
    }
    throw e;
  }

  // Load benchmark
  console.log(chalk.yellow('\nLoading benchmark...'));
  const benchmark = loadBenchmark(config.benchmark);
  console.log(chalk.green(`✓ ${benchmark.name}: ${benchmark.sessions.length} sessions, ${benchmark.questions.length} questions`));

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
    completedPhases: [],
    results: [],
    startTime: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
  };

  mkdirSync(join(RUNS_DIR, runId, 'results'), { recursive: true });

  // Ingest sessions
  console.log(chalk.yellow('\nIngesting sessions...'));
  const ingestStart = performance.now();
  for (const session of benchmark.sessions) {
    await provider.ingest(session);
  }
  console.log(chalk.green(`✓ Ingested ${benchmark.sessions.length} sessions (${(performance.now() - ingestStart).toFixed(0)}ms)`));

  // Process questions
  const questions = benchmark.questions.slice(0, checkpoint.progress.total);
  console.log(chalk.yellow(`\nProcessing ${questions.length} questions...\n`));
  
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    console.log(chalk.white(`[${i + 1}/${questions.length}] ${q.question}`));

    try {
      // Search with REAL embeddings
      const searchStart = performance.now();
      const context = await provider.search(q.question, { limit: 3 });
      const searchLatency = performance.now() - searchStart;

      // Generate answer with LLM
      const answerStart = performance.now();
      const answer = await provider.generateAnswer(q.question, context);
      const answerLatency = performance.now() - answerStart;

      // Judge with LLM (not keyword matching!)
      const evalStart = performance.now();
      const judgment = await provider.judgeAnswer(answer, q.groundTruth, q.question);
      const evalLatency = performance.now() - evalStart;

      const result: QuestionResult = {
        questionId: q.id,
        question: q.question,
        groundTruth: q.groundTruth,
        retrievedContext: context,
        generatedAnswer: answer,
        evaluation: {
          correct: judgment.correct,
          score: judgment.score,
          confidence: 0.85,
          reasoning: judgment.reasoning,
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

      const status = judgment.correct ? chalk.green('✓ CORRECT') : chalk.red('✗ WRONG');
      console.log(`  ${status} Score: ${judgment.score.toFixed(2)}`);
      console.log(`  Answer: ${answer.slice(0, 100)}${answer.length > 100 ? '...' : ''}`);
      if (!judgment.correct) {
        console.log(`  Reason: ${judgment.reasoning.slice(0, 100)}`);
      }
      console.log();

    } catch (error: any) {
      console.error(chalk.red(`  ✗ FAILED: ${error.message}`));
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
  writeFileSync(path, JSON.stringify(checkpoint, null, 2));
}

function generateReport(checkpoint: RunCheckpoint): BenchmarkReport {
  const results = checkpoint.results;
  const correct = results.filter(r => r.evaluation.correct).length;
  
  const avgSearchLatency = results.length > 0
    ? results.reduce((sum, r) => sum + r.latency.search, 0) / results.length
    : 0;
  
  const avgAnswerLatency = results.length > 0
    ? results.reduce((sum, r) => sum + r.latency.answer, 0) / results.length
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
      avgLatency: avgSearchLatency + avgAnswerLatency,
      totalTime: endTime - startTime,
    },
    byDifficulty: {},
    byType: {},
    results,
  };
}

function printReport(report: BenchmarkReport): void {
  const cfg = report.config as any;
  
  console.log('\n' + chalk.blue.bold('╔════════════════════════════════════════════════════════╗'));
  console.log(chalk.blue.bold('║                    BENCHMARK REPORT                    ║'));
  console.log(chalk.blue.bold('╚════════════════════════════════════════════════════════╝'));
  console.log();
  console.log(chalk.cyan(`Model:        ${cfg.model}`));
  console.log(chalk.cyan(`Embeddings:   ${cfg.embedModel || 'nomic-embed-text'}`));
  console.log(chalk.cyan(`Benchmark:    ${report.config.benchmark}`));
  console.log();
  console.log(chalk.yellow.bold('RESULTS'));
  console.log(chalk.gray('─'.repeat(50)));
  console.log(`Total:        ${report.summary.totalQuestions}`);
  console.log(`Answered:     ${report.summary.answered}`);
  console.log(`Correct:      ${chalk.green(report.summary.correct.toString())}`);
  
  const acc = report.summary.accuracy * 100;
  const accColor = acc >= 70 ? chalk.green : acc >= 50 ? chalk.yellow : chalk.red;
  console.log(`Accuracy:     ${accColor(acc.toFixed(1) + '%')}`);
  
  console.log(`Avg Latency:  ${report.summary.avgLatency.toFixed(0)}ms`);
  console.log(`Total Time:   ${(report.summary.totalTime / 1000).toFixed(1)}s`);
  console.log();
  
  // Comparison
  console.log(chalk.yellow.bold('COMPARISON'));
  console.log(chalk.gray('─'.repeat(50)));
  console.log(`Supermemory:  ${chalk.cyan('81.6%')} (LongMemEval)`);
  console.log(`Squish v2:    ${accColor(acc.toFixed(1) + '%')}`);
  
  const diff = acc - 81.6;
  if (diff >= 0) {
    console.log(`Status:       ${chalk.green('✓ MATCHES or BEATS Supermemory')}`);
  } else {
    console.log(`Gap:          ${chalk.yellow((-diff).toFixed(1) + '% behind')}`);
  }
  
  console.log();
  console.log(chalk.blue.bold('╔════════════════════════════════════════════════════════╗'));
  console.log(chalk.blue.bold('╚════════════════════════════════════════════════════════╝'));
  console.log();
}
