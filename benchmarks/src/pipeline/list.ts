/**
 * List Benchmark Questions
 */

import chalk from 'chalk';
import { loadBenchmark } from '../benchmarks/index.js';

export async function listQuestions(benchmarkName: string, limit: number): Promise<void> {
  const benchmark = loadBenchmark(benchmarkName);

  console.log(chalk.blue.bold(`\n${benchmark.name}: ${benchmark.description}`));
  console.log(`Total questions: ${benchmark.questions.length}`);
  console.log(`Sessions: ${benchmark.sessions.length}`);
  console.log('');

  const questions = benchmark.questions.slice(0, limit);

  for (const q of questions) {
    console.log(chalk.yellow(`${q.id}`));
    console.log(`  Question: ${q.question.slice(0, 80)}${q.question.length > 80 ? '...' : ''}`);
    console.log(`  Type: ${q.answerType} | Difficulty: ${q.difficulty}`);
    console.log(`  Session: ${q.sessionId}`);
    console.log('');
  }

  if (benchmark.questions.length > limit) {
    console.log(chalk.gray(`... and ${benchmark.questions.length - limit} more questions`));
  }
}
