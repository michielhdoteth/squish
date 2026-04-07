/**
 * Single Question Testing
 */

import chalk from 'chalk';
import { loadBenchmark } from '../benchmarks/index.js';
import { createSquishProvider } from '../providers/squish.js';
import { createJudge } from '../judges/index.js';
import { generateAnswer } from './answer.js';

interface TestOptions {
  provider: string;
  benchmark: string;
  questionId: string;
  runId?: string;
  judge: string;
}

export async function testQuestion(options: TestOptions): Promise<void> {
  const benchmark = loadBenchmark(options.benchmark);
  const question = benchmark.questions.find(q => q.id === options.questionId);

  if (!question) {
    console.error(chalk.red(`Question ${options.questionId} not found in ${options.benchmark}`));
    process.exit(1);
  }

  console.log(chalk.yellow('Question:'), question.question);
  console.log(chalk.yellow('Ground Truth:'), question.groundTruth);
  console.log(chalk.yellow('Type:'), question.answerType);
  console.log(chalk.yellow('Difficulty:'), question.difficulty);
  console.log('');

  // Initialize provider
  const provider = createSquishProvider();
  const judge = createJudge(options.judge);

  // Ingest session if needed
  const session = benchmark.getSessionById?.(question.sessionId);
  if (session) {
    console.log('Ingesting session...');
    await provider.ingest(session);
    await provider.index();
  }

  // Search
  console.log('Searching...');
  const searchStart = performance.now();
  const context = await provider.search(question.question, { limit: 5 });
  const searchLatency = performance.now() - searchStart;

  console.log(chalk.gray(`Found ${context.length} results in ${searchLatency.toFixed(0)}ms`));
  context.forEach((r, i) => {
    console.log(chalk.gray(`  [${i + 1}] Score: ${r.score.toFixed(3)} | ${r.content.slice(0, 80)}...`));
  });
  console.log('');

  // Generate answer
  console.log('Generating answer...');
  const answer = await generateAnswer(question.question, context, 'gpt-4o');
  console.log(chalk.cyan('Generated Answer:'), answer);
  console.log('');

  // Evaluate
  console.log('Evaluating...');
  const evaluation = await judge.evaluate(answer, question.groundTruth, question.question);

  console.log(chalk.yellow.bold('\nRESULTS:'));
  console.log('Correct:', evaluation.correct ? chalk.green('Yes') : chalk.red('No'));
  console.log('Score:', evaluation.score.toFixed(2));
  console.log('Confidence:', evaluation.confidence.toFixed(2));
  console.log('Reasoning:', evaluation.reasoning);
}
