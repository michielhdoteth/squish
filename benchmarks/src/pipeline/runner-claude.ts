/**
 * Benchmark Runner - REAL Squish + Claude
 * 
 * Uses ACTUAL Squish architecture:
 * - Real database (SQLite with FTS5 OR PostgreSQL with pgvector)
 * - Real embeddings (TF-IDF/Ollama/OpenAI depending on Squish config)
 * - Claude for answer generation and judging
 */

import chalk from 'chalk';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { RunConfig, RunCheckpoint, QuestionResult, BenchmarkReport } from '../types/index.js';
import { loadBenchmark } from '../benchmarks/index.js';
import { createSquishClaudeProvider } from '../providers/squish-claude.js';

const RUNS_DIR = process.env.RUNS_DIR || './data/runs';

interface ClaudeRunConfig extends RunConfig {
  claudeModel: string;
  project?: string;
}

export async function runBenchmarkClaude(config: ClaudeRunConfig): Promise<BenchmarkReport> {
  const runId = config.runId || `run-squish-real-${Date.now()}`;
  
  console.log(chalk.blue.bold('\n╔════════════════════════════════════════════════════════╗'));
  console.log(chalk.blue.bold('║        REAL SQUISH BENCHMARK - Actual Core + DB        ║'));
  console.log(chalk.blue.bold('╚════════════════════════════════════════════════════════╝\n'));

  // Check for Claude API
  const hasClaudeKey = process.env.ANTHROPIC_API_KEY && 
                       process.env.ANTHROPIC_API_KEY.startsWith('sk-ant');
  
  if (!hasClaudeKey) {
    console.error(chalk.red('✗ ANTHROPIC_API_KEY required'));
    console.log(chalk.yellow('   Get a key from: https://console.anthropic.com/'));
    process.exit(1);
  }

  // Initialize REAL Squish provider
  const provider = createSquishClaudeProvider({
    project: config.project,
    claudeModel: config.claudeModel,
  });

  // Initialize and get stats
  try {
    await provider.init();
    const stats = provider.getStats();
    console.log(chalk.cyan(`Squish Mode:  ${stats.mode}`));
    console.log(chalk.cyan(`Claude Model: ${config.claudeModel}`));
    console.log(chalk.cyan(`Benchmark:    ${config.benchmark}\n`));
  } catch (e: any) {
    console.error(chalk.red(`✗ ${e.message}`));
    console.log(chalk.yellow('\nTo set up Squish:'));
    console.log('  cd ../squish && bun install && bun run build');
    process.exit(1);
  }

  // Load benchmark
  console.log(chalk.yellow('Loading benchmark...'));
  const benchmark = loadBenchmark(config.benchmark);
  console.log(chalk.green(`✓ ${benchmark.name}: ${benchmark.sessions.length} sessions, ${benchmark.questions.length} questions\n`));

  const checkpoint: RunCheckpoint = {
    runId,
    config,
    status: 'pending',
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

  // Clear old memories
  await provider.clear();

  // Ingest with REAL Squish
  console.log(chalk.yellow('Ingesting sessions with REAL Squish...'));
  const ingestStart = performance.now();
  for (const session of benchmark.sessions) {
    await provider.ingest(session);
  }
  console.log(chalk.green(`✓ Ingested ${benchmark.sessions.length} sessions (${(performance.now() - ingestStart).toFixed(0)}ms)\n`));

  // Process questions
  const questions = benchmark.questions.slice(0, checkpoint.progress.total);
  console.log(chalk.yellow(`Processing ${questions.length} questions...\n`));
  
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    console.log(chalk.white(`[${i + 1}/${questions.length}] ${q.question}`));

    try {
      // Retrieve with REAL Squish (FTS5 or pgvector)
      const searchStart = performance.now();
      const context = await provider.search(q.question, { 
        limit: 3,
        sessionId: q.sessionId
      });
      const searchLatency = performance.now() - searchStart;

      // Generate with Claude
      const answerStart = performance.now();
      const answer = await provider.generateAnswer(q.question, context);
      const answerLatency = performance.now() - answerStart;

      // Judge with Claude
      const evalStart = performance.now();
      const judgment = await provider.evaluateAnswer(q.question, answer, q.groundTruth);
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
          confidence: 0.9,
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

      // Save
      writeFileSync(
        join(RUNS_DIR, runId, 'results', `${q.id}.json`),
        JSON.stringify(result, null, 2)
      );

      const status = judgment.correct ? chalk.green('✓ CORRECT') : chalk.red('✗ WRONG');
      console.log(`  ${status} Score: ${judgment.score.toFixed(2)}`);
      console.log(`  Answer: ${answer.slice(0, 100)}${answer.length > 100 ? '...' : ''}`);
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
  console.log(chalk.blue.bold('║                 REAL SQUISH RESULTS                    ║'));
  console.log(chalk.blue.bold('╚════════════════════════════════════════════════════════╝'));
  console.log();
  console.log(chalk.cyan(`Squish Mode:  ${cfg.project || 'benchmark-test'}`));
  console.log(chalk.cyan(`Claude Model: ${cfg.claudeModel}`));
  console.log(chalk.cyan(`Benchmark:    ${report.config.benchmark}`));
  console.log();
  console.log(chalk.yellow.bold('RESULTS'));
  console.log(chalk.gray('─'.repeat(50)));
  console.log(`Total:        ${report.summary.totalQuestions}`);
  console.log(`Answered:     ${report.summary.answered}`);
  console.log(`Correct:      ${chalk.green(report.summary.correct.toString())}`);
  
  const acc = report.summary.accuracy * 100;
  const accColor = acc >= 80 ? chalk.green : acc >= 60 ? chalk.yellow : chalk.red;
  console.log(`Accuracy:     ${accColor(acc.toFixed(1) + '%')}`);
  
  console.log(`Avg Latency:  ${report.summary.avgLatency.toFixed(0)}ms`);
  console.log(`Total Time:   ${(report.summary.totalTime / 1000).toFixed(1)}s`);
  console.log();
  
  // Comparison
  console.log(chalk.yellow.bold('COMPARISON'));
  console.log(chalk.gray('─'.repeat(50)));
  console.log(`Mem0:        ${chalk.cyan('66.9%')} (LoCoMo)`);
  console.log(`Supermemory: ${chalk.cyan('81.6%')} (LongMemEval)`);
  console.log(`Squish:      ${accColor(acc.toFixed(1) + '%')}`);
  
  if (acc >= 80) {
    console.log(`Status:      ${chalk.green('✓ EXCELLENT RESULTS!')}`);
  } else if (acc >= 60) {
    console.log(`Status:      ${chalk.yellow('~ COMPETITIVE')}`);
  } else {
    console.log(`Status:      ${chalk.red('✗ Needs improvement')}`);
  }
  
  console.log();
  console.log(chalk.blue.bold('╔════════════════════════════════════════════════════════╗'));
  console.log(chalk.blue.bold('╚════════════════════════════════════════════════════════╝'));
  console.log();
  
  if (acc === 100) {
    console.log(chalk.green('🎉 PERFECT SCORE with REAL Squish architecture!'));
    console.log(chalk.gray('   Using actual database (SQLite FTS5 or PostgreSQL pgvector)'));
  }
}
