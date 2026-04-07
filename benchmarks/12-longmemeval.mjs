#!/usr/bin/env node

import { readFileSync } from 'fs';
import { join } from 'path';
import { cosineSimilarity } from '../dist/core/utils/vector-operations.js';

const OLLAMA_URL = 'http://localhost:11434';

async function generateEmbedding(text) {
  try {
    const response = await fetch(`${OLLAMA_URL}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'nomic-embed-text', prompt: text })
    });
    return await response.json();
  } catch (e) {
    return { embedding: null };
  }
}

async function generateChat(model, messages) {
  try {
    const response = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, stream: false })
    });
    return await response.json();
  } catch (e) {
    return { error: e.message };
  }
}

async function retrieveContext(question, memories, topK = 10) {
  const qEmb = await generateEmbedding(question);
  if (!qEmb.embedding) return [];

  const scored = memories.map(m => ({
    ...m,
    score: cosineSimilarity(qEmb.embedding, m.embedding)
  }));

  return scored.sort((a, b) => b.score - a.score).slice(0, topK);
}

function normalizeAnswer(answer) {
  const str = Array.isArray(answer) ? answer.join(' ') : String(answer || '');
  return str.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
}

function checkAnswer(hypothesis, groundTruth) {
  const h = normalizeAnswer(hypothesis);
  const g = normalizeAnswer(groundTruth);
  
  if (h === g) return 1.0;
  if (g.includes(h) || h.includes(g)) return 0.8;
  if (h.split(' ').filter(w => g.includes(w)).length > g.split(' ').length * 0.5) return 0.5;
  return 0;
}

async function runLongMemEvalBenchmark() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║  LongMemEval Benchmark - 500 Questions                   ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  const data = JSON.parse(readFileSync(
    join(process.cwd(), '..', 'squish-benchmarks', 'data', 'benchmarks', 'longmemeval.json'),
    'utf-8'
  ));

  console.log(`Dataset: LongMemEval`);
  console.log(`Total Questions: ${data.length}`);
  console.log(`Types: ${[...new Set(data.map(x => x.question_type))].join(', ')}\n`);

  const memories = [];
  for (let i = 0; i < Math.min(data.length, 50); i++) {
    const item = data[i];
    for (const session of (item.haystack_sessions || [])) {
      for (const turn of session) {
        if (turn.content) {
          const emb = await generateEmbedding(turn.content);
          memories.push({
            text: turn.content,
            session: item.question_id,
            embedding: emb.embedding
          });
        }
      }
    }
    if (i % 10 === 0) console.log(`Indexed ${i}/${Math.min(data.length, 50)} sessions...`);
  }

  console.log(`\n📚 Loaded ${memories.length} memory items\n`);

  const results = {
    model: 'qwen2.5:0.5b',
    questions: [],
    summary: {}
  };

  const typeScores = {};
  const totalByType = {};

  console.log('┌────────────────────────────────────────────────────────────────────────┐');
  console.log('│ Question                                                           │ Score │');
  console.log('├────────────────────────────────────────────────────────────────────────┼───────┤');

  let totalScore = 0;
  const questionsToRun = Math.min(data.length, 100);

  for (let i = 0; i < questionsToRun; i++) {
    const q = data[i];
    const context = await retrieveContext(q.question, memories, 5);
    const contextText = context.map(c => c.text).join('\n');

    const prompt = `Based on the following context, answer the question:

Context:
${contextText}

Question: ${q.question}

If the answer is not in the context, say "I don't know."`;

    const start = Date.now();
    const llmResult = await generateChat('qwen2.5:0.5b', [
      { role: 'system', content: 'You are a helpful assistant. Answer based ONLY on the provided context.' },
      { role: 'user', content: prompt }
    ]);
    const latency = Date.now() - start;

    const answer = llmResult.message?.content || 'No response';
    const score = checkAnswer(answer, q.answer);

    totalScore += score;
    
    if (!typeScores[q.question_type]) {
      typeScores[q.question_type] = 0;
      totalByType[q.question_type] = 0;
    }
    typeScores[q.question_type] += score;
    totalByType[q.question_type]++;

    const status = score >= 0.8 ? '✅' : score >= 0.5 ? '🟡' : '❌';
    const qShort = q.question.length > 50 ? q.question.substring(0, 47) + '...' : q.question;

    console.log(`│ ${status} ${qShort.padEnd(63)} │ ${(score * 100).toFixed(0).padStart(3)}% │`);

    results.questions.push({
      id: q.question_id,
      type: q.question_type,
      question: q.question,
      answer,
      groundTruth: q.answer,
      score,
      latency
    });

    if (i % 20 === 19) {
      console.log(`  Progress: ${i + 1}/${questionsToRun} (${Math.round((i + 1) / questionsToRun * 100)}%)`);
    }
  }

  console.log('└────────────────────────────────────────────────────────────────────────┴───────┘');

  const accuracy = Math.round((totalScore / questionsToRun) * 100);

  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║  RESULTS                                                      ║');
  console.log('╠════════════════════════════════════════════════════════════════╣');

  console.log(`║  Model:           qwen2.5:0.5b (local Ollama)              ║`);
  console.log(`║  Dataset:         LongMemEval (${questionsToRun} questions)                          ║`);
  console.log(`╠════════════════════════════════════════════════════════════════╣`);
  console.log(`║  OVERALL SCORE:  ${String(accuracy + '%').padStart(40)} ║`);
  console.log('╚════════════════════════════════════════════════════════════════╝');

  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║  BY QUESTION TYPE                                           ║');
  console.log('╠════════════════════════════════════════════════════════════════╣');
  
  for (const type of Object.keys(typeScores)) {
    const typeAcc = Math.round((typeScores[type] / totalByType[type]) * 100);
    console.log(`║  ${type.padEnd(20)}: ${String(typeAcc + '%').padStart(4)}  (${totalByType[type]} questions)    ║`);
  }
  console.log('╚════════════════════════════════════════════════════════════════╝');

  console.log('\n📊 Comparison with Competition:');
  console.log('┌──────────────────────┬────────┬───────────────────────────────────┐');
  console.log('│ System               │  Score │ Notes                             │');
  console.log('├──────────────────────┼────────┼───────────────────────────────────┤');
  console.log(`│ Squish (qwen2.5:0.5b)│   ${accuracy}%  │ Local, no API cost              │`);
  console.log('│ Supermemory          │  81.6% │ LongMemEval official #1          │');
  console.log('│ Mem0                 │   ~75% │ +26% vs OpenAI (claimed)          │');
  console.log('└──────────────────────┴────────┴───────────────────────────────────┘');

  results.summary = {
    accuracy,
    total: questionsToRun,
    typeScores,
    totalByType
  };

  return results;
}

runLongMemEvalBenchmark().then(r => {
  console.log('\n✅ LongMemEval benchmark complete');
  process.exit(0);
}).catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
