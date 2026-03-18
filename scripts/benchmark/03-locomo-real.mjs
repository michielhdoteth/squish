#!/usr/bin/env node

import { readFileSync } from 'fs';
import { join } from 'path';

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

function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

async function retrieveContext(question, memories, topK = 5) {
  const qEmb = await generateEmbedding(question);
  if (!qEmb.embedding) return [];

  const scored = memories.map(m => ({
    ...m,
    score: cosineSimilarity(qEmb.embedding, m.embedding)
  }));

  return scored.sort((a, b) => b.score - a.score).slice(0, topK);
}

async function scoreWithLLM(model, question, answer, groundTruth) {
  const prompt = `You are evaluating AI answers against ground truth.

Question: ${question}
AI Answer: ${answer}
Ground Truth: ${groundTruth}

Rate the AI answer as: CORRECT, PARTIAL, or INCORRECT

Consider:
- CORRECT: Answer matches the key facts in ground truth
- PARTIAL: Answer has some correct info but missing or wrong details
- INCORRECT: Answer contradicts or misses key facts

Respond with just one word: CORRECT, PARTIAL, or INCORRECT`;

  const result = await generateChat(model, [
    { role: 'user', content: prompt }
  ]);

  const response = result.message?.content?.toUpperCase() || '';

  if (response.includes('CORRECT') && !response.includes('PARTIAL')) return 1.0;
  if (response.includes('PARTIAL')) return 0.5;
  return 0;
}

async function runLoCoMoBenchmark() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║  LoCoMo REAL Benchmark - Using Actual Dataset           ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  const locomoData = JSON.parse(readFileSync(
    join(process.cwd(), '..', 'squish-benchmarks', 'data', 'benchmarks', 'locomo.json'),
    'utf-8'
  ));

  console.log(`Dataset: ${locomoData.name}`);
  console.log(`Sessions: ${locomoData.sessions.length}`);
  console.log(`Questions: ${locomoData.questions.length}\n`);

  const results = {
    model: 'qwen2.5:0.5b',
    questions: [],
    summary: {}
  };

  const memories = [];
  for (const session of locomoData.sessions) {
    for (const turn of session.turns) {
      if (turn.role === 'user' && turn.content) {
        const emb = await generateEmbedding(turn.content);
        memories.push({
          text: turn.content,
          session: session.id,
          embedding: emb.embedding
        });
      }
    }
  }

  console.log(`📚 Loaded ${memories.length} memory items\n`);

  console.log('┌────────────────────────────────────────────────────────────────────────┐');
  console.log('│ Question                                                           │ Score │');
  console.log('├────────────────────────────────────────────────────────────────────────┼───────┤');

  let totalScore = 0;
  let correctCount = 0;
  let partialCount = 0;

  for (const q of locomoData.questions) {
    const context = await retrieveContext(q.question, memories, 3);
    const contextText = context.map(c => c.text).join('\n');

    const prompt = `Based on the following context, answer the question:

Context:
${contextText}

Question: ${q.question}

If the answer is not in the context, say "I don't know based on the provided information."`;

    const start = Date.now();
    const llmResult = await generateChat('qwen2.5:0.5b', [
      { role: 'system', content: 'You are a helpful assistant. Answer based ONLY on the provided context.' },
      { role: 'user', content: prompt }
    ]);
    const latency = Date.now() - start;

    const answer = llmResult.message?.content || 'No response';
    const score = await scoreWithLLM('qwen2.5:0.5b', q.question, answer, q.groundTruth);

    totalScore += score;
    if (score === 1.0) correctCount++;
    else if (score === 0.5) partialCount++;

    const status = score === 1 ? '✅' : score === 0.5 ? '🟡' : '❌';
    const qShort = q.question.length > 50 ? q.question.substring(0, 47) + '...' : q.question;

    console.log(`│ ${status} ${qShort.padEnd(63)} │ ${(score * 100).toFixed(0).padStart(3)}% │`);

    results.questions.push({
      id: q.id,
      question: q.question,
      answer,
      groundTruth: q.groundTruth,
      score,
      latency
    });
  }

  console.log('└────────────────────────────────────────────────────────────────────────┴───────┘');

  const accuracy = Math.round((totalScore / locomoData.questions.length) * 100);

  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║  RESULTS                                                      ║');
  console.log('╠════════════════════════════════════════════════════════════════╣');

  console.log(`║  Model:           qwen2.5:0.5b (local Ollama)              ║`);
  console.log(`║  Dataset:         LoCoMo (${locomoData.questions.length} questions)                         ║`);
  console.log(`║  Correct:         ${correctCount}/${locomoData.questions.length}                                       ║`);
  console.log(`║  Partial:         ${partialCount}/${locomoData.questions.length}                                       ║`);
  console.log(`║  Incorrect:       ${locomoData.questions.length - correctCount - partialCount}/${locomoData.questions.length}                                       ║`);
  console.log(`╠════════════════════════════════════════════════════════════════╣`);
  console.log(`║  OVERALL SCORE:  ${String(accuracy + '%').padStart(40)} ║`);
  console.log('╚════════════════════════════════════════════════════════════════╝');

  results.summary = {
    accuracy,
    correct: correctCount,
    partial: partialCount,
    incorrect: locomoData.questions.length - correctCount - partialCount,
    total: locomoData.questions.length
  };

  console.log('\n📊 Comparison with Competition:');
  console.log('┌──────────────────────┬────────┬───────────────────────────────────┐');
  console.log('│ System               │  Score │ Notes                             │');
  console.log('├──────────────────────┼────────┼───────────────────────────────────┤');
  console.log(`│ Squish (qwen2.5:0.5b)│   ${accuracy}%  │ Local, no API cost              │`);
  console.log('│ OpenViking          │   52%  │ Cloud, filesystem-based           │');
  console.log('│ Supermemory         │   81%  │ Cloud, different benchmark        │');
  console.log('└──────────────────────┴────────┴───────────────────────────────────┘');

  return results;
}

runLoCoMoBenchmark().then(r => {
  console.log('\n✅ LoCoMo benchmark complete');
  process.exit(0);
}).catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
