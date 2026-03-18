#!/usr/bin/env bun

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
    return { embedding: data.embedding, latency: Date.now() - start };
  } catch (e) {
    return { embedding: null, latency: -1, error: e.message };
  }
}

async function runOllamaBenchmark() {
  console.log('\n📊 Ollama Embedding Benchmark\n');
  console.log('Model: nomic-embed-text:v1.5');
  console.log('');

  const results = { tests: [], summary: {} };

  const testTexts = [
    'Hello, how are you today?',
    'The quick brown fox jumps over the lazy dog.',
    'Machine learning is a subset of artificial intelligence.',
    'SQLite is a lightweight, embedded database engine.',
    'TypeScript adds static typing to JavaScript.',
  ];

  console.log('┌─────────────┬────────┬────────┐');
  console.log('│ Test       │ Latency│ Status │');
  console.log('├─────────────┼────────┼────────┤');

  let totalLatency = 0;
  let successCount = 0;

  for (let i = 0; i < testTexts.length; i++) {
    const { latency, error } = await generateEmbedding(testTexts[i]);
    const status = latency > 0 ? '✅' : '❌';
    
    if (latency > 0) {
      totalLatency += latency;
      successCount++;
    }

    console.log(`│ Test ${i + 1}      │ ${String(latency).padStart(5)}ms │ ${status}      │`);
    
    results.tests.push({
      text: testTexts[i].substring(0, 30) + '...',
      latency: latency,
      success: latency > 0
    });
  }

  console.log('└─────────────┴────────┴────────┘');

  const avgLatency = successCount > 0 ? Math.round(totalLatency / successCount) : 0;

  console.log(`\n📊 Results:`);
  console.log(`   Total tests: ${testTexts.length}`);
  console.log(`   Successful: ${successCount}`);
  console.log(`   Failed: ${testTexts.length - successCount}`);
  console.log(`   Average latency: ${avgLatency}ms`);

  results.summary = {
    totalTests: testTexts.length,
    successful: successCount,
    failed: testTexts.length - successCount,
    avgLatency: avgLatency
  };

  if (successCount > 0) {
    console.log(`\n✅ Ollama embedding service is working!`);
  } else {
    console.log(`\n❌ Ollama embedding service is not responding`);
  }

  return results;
}

export default runOllamaBenchmark;

if (import.meta.url === `file://${process.argv[1]}`) {
  runOllamaBenchmark();
}
