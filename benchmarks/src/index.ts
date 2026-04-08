#!/usr/bin/env bun

/**
 * MemoryBench - Pluggable Benchmarking Framework for Memory and Context Systems
 * 
 * Adapted for Squish from supermemoryai/memorybench
 * 
 * Usage:
 *   bun run src/index.ts run -p squish -b locomo
 *   bun run src/index.ts compare -p squish -b locomo,longmemeval
 *   bun run src/index.ts serve
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { runBenchmark } from './pipeline/runner.js';
import { compareBenchmarks } from './pipeline/compare.js';
import { serveWebUI } from './web/server.js';
import { testQuestion } from './pipeline/test.js';
import { showStatus, showFailures } from './pipeline/status.js';
import { listQuestions } from './pipeline/list.js';
import { listBenchmarks } from './benchmarks/index.js';

const program = new Command();

program
  .name('memorybench')
  .description('MemoryBench - Benchmark memory systems against LoCoMo, LongMemEval, Convomem')
  .version('1.0.0');

program
  .command('run')
  .description('Full pipeline: ingest → index → search → answer → evaluate → report')
  .option('-p, --provider <provider>', 'Memory provider (squish)', 'squish')
  .option('-b, --benchmark <benchmark>', 'Benchmark dataset (locomo, longmemeval, convomem)', 'locomo')
  .option('-j, --judge <judge>', 'Judge model (gpt-4o, claude-sonnet, local)', 'local')
  .option('-m, --answering-model <model>', 'Model for answer generation', 'local')
  .option('-r, --run-id <id>', 'Run identifier (auto-generated if omitted)')
  .option('-l, --limit <n>', 'Limit number of questions', '0')
  .option('-q, --question-id <id>', 'Specific question (for testing)')
  .option('--force', 'Clear checkpoint and restart')
  .action(async (options) => {
    console.log(chalk.blue.bold('MemoryBench - Running Benchmark\n'));
    await runBenchmark({
      provider: options.provider,
      benchmark: options.benchmark,
      judge: options.judge,
      answeringModel: options.answeringModel,
      runId: options.runId,
      limit: parseInt(options.limit),
      questionId: options.questionId,
      force: options.force,
    });
  });

program
  .command('run-local')
  .description('Run with local LLM (Ollama/HF) - no API keys needed')
  .option('-m, --model <model>', 'Local model name (qwen2.5:3b, phi3, etc.)', 'qwen2.5:3b')
  .option('-b, --benchmark <benchmark>', 'Benchmark dataset', 'locomo')
  .option('-l, --limit <n>', 'Limit questions', '0')
  .option('--use-hf', 'Use HuggingFace instead of Ollama')
  .action(async (options) => {
    console.log(chalk.blue.bold('MemoryBench - Local LLM Benchmark\n'));
    const { runBenchmarkLocal } = await import('./pipeline/runner-local.js');
    await runBenchmarkLocal({
      provider: 'local-llm',
      benchmark: options.benchmark,
      judge: options.model,
      answeringModel: options.model,
      localModel: options.model,
      useOllama: !options.useHf,
      runId: `local-${options.model.replace(/[:\/]/g, '-')}-${Date.now()}`,
      limit: parseInt(options.limit),
    });
  });

program
  .command('run-v2')
  .description('Run with REAL embeddings + LLM judge (RECOMMENDED)')
  .option('-m, --model <model>', 'Generation model', 'qwen2.5:3b')
  .option('-e, --embed <model>', 'Embedding model', 'nomic-embed-text')
  .option('-b, --benchmark <benchmark>', 'Benchmark dataset', 'locomo')
  .option('-l, --limit <n>', 'Limit questions', '0')
  .action(async (options) => {
    const { runBenchmarkV2 } = await import('./pipeline/runner-v2.js');
    await runBenchmarkV2({
      provider: 'local-llm-v2',
      benchmark: options.benchmark,
      judge: options.model,
      answeringModel: options.model,
      model: options.model,
      embedModel: options.embed,
      runId: `v2-${options.model.replace(/[:\/]/g, '-')}-${Date.now()}`,
      limit: parseInt(options.limit),
    });
  });

program
  .command('run-claude')
  .description('Run with Squish + Claude (realistic for Claude Code plugin)')
  .option('-c, --claude <model>', 'Claude model', 'claude-3-haiku-20240307')
  .option('-b, --benchmark <benchmark>', 'Benchmark dataset', 'locomo')
  .option('-l, --limit <n>', 'Limit questions', '0')
  .option('-p, --project <project>', 'Squish project name', 'benchmark-test')
  .action(async (options) => {
    const { runBenchmarkClaude } = await import('./pipeline/runner-claude.js');
    await runBenchmarkClaude({
      provider: 'squish-claude',
      benchmark: options.benchmark,
      judge: options.claude,
      answeringModel: options.claude,
      claudeModel: options.claude,
      project: options.project,
      runId: `squish-real-${Date.now()}`,
      limit: parseInt(options.limit),
    });
  });

program
  .command('compare')
  .description('Run benchmark across multiple datasets simultaneously')
  .option('-p, --provider <provider>', 'Memory provider', 'squish')
  .option('-b, --benchmarks <benchmarks>', 'Comma-separated benchmarks', 'locomo')
  .option('-s, --sample <n>', 'Sample size per benchmark', '10')
  .option('-j, --judge <judge>', 'Judge model', 'gpt-4o')
  .action(async (options) => {
    console.log(chalk.blue.bold('MemoryBench - Comparison Mode\n'));
    const benchmarks = options.benchmarks.split(',');
    await compareBenchmarks({
      provider: options.provider,
      benchmarks,
      sampleSize: parseInt(options.sample),
      judge: options.judge,
    });
  });

program
  .command('test')
  .description('Test single question')
  .option('-p, --provider <provider>', 'Memory provider', 'squish')
  .option('-b, --benchmark <benchmark>', 'Benchmark dataset', 'locomo')
  .option('-q, --question-id <id>', 'Question ID (required)')
  .option('-r, --run-id <id>', 'Run ID to use')
  .option('-j, --judge <judge>', 'Judge model', 'gpt-4o')
  .action(async (options) => {
    if (!options.questionId) {
      console.error(chalk.red('Error: --question-id is required'));
      process.exit(1);
    }
    console.log(chalk.blue.bold('MemoryBench - Single Question Test\n'));
    await testQuestion({
      provider: options.provider,
      benchmark: options.benchmark,
      questionId: options.questionId,
      runId: options.runId,
      judge: options.judge,
    });
  });

program
  .command('status')
  .description('Check run progress')
  .option('-r, --run-id <id>', 'Run ID (required)')
  .action(async (options) => {
    if (!options.runId) {
      console.error(chalk.red('Error: --run-id is required'));
      process.exit(1);
    }
    await showStatus(options.runId);
  });

program
  .command('show-failures')
  .description('Debug failed questions')
  .option('-r, --run-id <id>', 'Run ID (required)')
  .action(async (options) => {
    if (!options.runId) {
      console.error(chalk.red('Error: --run-id is required'));
      process.exit(1);
    }
    await showFailures(options.runId);
  });

program
  .command('list-questions')
  .description('Browse benchmark questions')
  .option('-b, --benchmark <benchmark>', 'Benchmark dataset', 'locomo')
  .option('-l, --limit <n>', 'Limit results', '20')
  .action(async (options) => {
    await listQuestions(options.benchmark, parseInt(options.limit));
  });

program
  .command('list-benchmarks')
  .description('List available benchmarks')
  .action(() => {
    console.log(chalk.blue.bold('\nAvailable Benchmarks:'));
    console.log('-'.repeat(40));
    for (const name of listBenchmarks()) {
      console.log(`  • ${name}`);
    }
    console.log('');
  });

program
  .command('serve')
  .description('Start web UI for inspecting runs')
  .option('-p, --port <port>', 'Port number', '8080')
  .action(async (options) => {
    console.log(chalk.blue.bold(`MemoryBench - Starting Web UI on port ${options.port}\n`));
    await serveWebUI(parseInt(options.port));
  });

program.parse();
