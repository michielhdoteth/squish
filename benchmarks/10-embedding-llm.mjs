#!/usr/bin/env node

import http from 'http';

const OLLAMA_URL = 'http://localhost:11434';

async function generateEmbedding(text) {
  const start = Date.now();
  try {
    const response = await fetch(`${OLLAMA_URL}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'nomic-embed-text', prompt: text })
    });
    const data = await response.json();
    return { embedding: data.embedding, latency: Date.now() - start, dimension: data.embedding?.length || 0 };
  } catch (e) {
    return { embedding: null, latency: -1, error: e.message };
  }
}

async function generateChat(model, messages) {
  const start = Date.now();
  try {
    const response = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, stream: false })
    });
    const data = await response.json();
    return { response: data.message?.content || '', latency: Date.now() - start, done: data.done };
  } catch (e) {
    return { response: '', latency: -1, error: e.message };
  }
}

async function runEmbeddingBenchmark() {
  console.log('\n📊 Ollama Embedding & LLM Benchmark\n');
  
  const results = { embedding: {}, llm: {}, summary: {} };
  
  console.log('=== Embedding Generation (nomic-embed-text) ===\n');
  
  const testTexts = [
    { name: 'Short text', text: 'Hello, how are you?' },
    { name: 'Medium text', text: 'I work at Amazon as a Senior Software Engineer on the AWS Lambda team.' },
    { name: 'Long text', text: 'I am a professor of astrophysics at Caltech. My research focuses on exoplanet atmospheres using the James Webb Space Telescope. I have three PhD students: Emma, Raj, and Lisa. I collaborate with MIT and Oxford.' },
    { name: 'Code', text: 'async function generateEmbedding(text) { const response = await fetch(url); return response.json(); }' },
    { name: 'Memory', text: 'User said: My manager Sarah wants results by end of quarter. My cat Luna keeps me company during meetings.' },
  ];
  
  console.log('┌──────────────────┬────────────┬────────────┬────────────┐');
  console.log('│ Text             │ Latency    │ Dimension  │ Rate       │');
  console.log('├──────────────────┼────────────┼────────────┼────────────┤');
  
  let totalEmbLatency = 0;
  
  for (const test of testTexts) {
    const { latency, dimension, error } = await generateEmbedding(test.text);
    
    if (latency > 0) {
      totalEmbLatency += latency;
      const rate = Math.round(1000 / latency);
      console.log(`│ ${test.name.padEnd(16)} │ ${String(latency + 'ms').padStart(9)} │ ${String(dimension).padStart(9)} │ ${String(rate + '/s').padStart(9)} │`);
    } else {
      console.log(`│ ${test.name.padEnd(16)} │ ❌ Error   │ -          │ -          │`);
    }
    
    results.embedding[test.name] = { latency, dimension };
  }
  
  console.log('└──────────────────┴────────────┴────────────┴────────────┘');
  
  const avgEmbLatency = Math.round(totalEmbLatency / testTexts.length);
  console.log(`\n   Average embedding latency: ${avgEmbLatency}ms`);
  console.log(`   Embedding dimension: 768 (nomic-embed-text v1.5)`);
  
  console.log('\n=== LLM Generation (qwen2.5:0.5b) ===\n');
  
  const llmTests = [
    { name: 'Simple Q&A', prompt: 'What is 2+2?', expected: '4' },
    { name: 'Memory recall', prompt: 'User memory: My cat is Luna. What is the cat\'s name?', expected: 'Luna' },
    { name: 'Fact extraction', prompt: 'Extract the company name: I work at Amazon as a software engineer.', expected: 'Amazon' },
    { name: 'Short answer', prompt: 'Answer with one word: What is the capital of France?', expected: 'Paris' },
    { name: 'Summary', prompt: 'Summarize in 10 words: Machine learning is a subset of artificial intelligence that enables systems to learn from data.', expected: 'machine' },
  ];
  
  console.log('┌──────────────────┬────────────┬────────┬────────────┐');
  console.log('│ Test             │ Latency    │ Tokens │ Status     │');
  console.log('├──────────────────┼────────────┼────────┼────────────┤');
  
  let totalLlmLatency = 0;
  let correctCount = 0;
  
  for (const test of llmTests) {
    const { response, latency } = await generateChat('qwen2.5:0.5b', [
      { role: 'user', content: test.prompt }
    ]);
    
    totalLlmLatency += latency;
    const correct = response.toLowerCase().includes(test.expected.toLowerCase());
    if (correct) correctCount++;
    
    const tokens = Math.round(response.length / 4);
    const status = correct ? '✅' : '❌';
    
    console.log(`│ ${test.name.padEnd(16)} │ ${String(latency + 'ms').padStart(9)} │ ${String(tokens).padStart(5)} │ ${status} ${correct ? 'Correct   ' : 'Incorrect ' } │`);
    
    results.llm[test.name] = { latency, tokens, correct };
  }
  
  console.log('└──────────────────┴────────────┴────────┴────────────┘');
  
  const avgLlmLatency = Math.round(totalLlmLatency / llmTests.length);
  const accuracy = Math.round((correctCount / llmTests.length) * 100);
  
  console.log(`\n   Average LLM latency: ${avgLlmLatency}ms`);
  console.log(`   Accuracy: ${correctCount}/${llmTests.length} (${accuracy}%)`);
  
  results.summary = {
    embedding: { avgLatency: avgEmbLatency, dimension: 768 },
    llm: { avgLatency: avgLlmLatency, accuracy }
  };
  
  console.log('\n=== Summary ===\n');
  console.log('┌────────────────────┬────────────────┐');
  console.log('│ Metric            │ Value          │');
  console.log('├────────────────────┼────────────────┤');
  console.log(`│ Embedding latency  │ ${String(avgEmbLatency + 'ms').padStart(13)} │`);
  console.log(`│ Embedding dim     │ ${String('768').padStart(13)} │`);
  console.log(`│ LLM latency       │ ${String(avgLlmLatency + 'ms').padStart(13)} │`);
  console.log(`│ LLM accuracy       │ ${String(accuracy + '%').padStart(13)} │`);
  console.log('└────────────────────┴────────────────┘');
  
  return results;
}

runEmbeddingBenchmark().then(r => {
  console.log('\n✅ Embedding & LLM benchmark complete');
  process.exit(0);
}).catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
