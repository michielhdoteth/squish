#!/usr/bin/env bun

const OLLAMA_URL = 'http://localhost:11434';

async function generateChat(model, messages) {
  const start = Date.now();
  try {
    const response = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, stream: false })
    });
    const data = await response.json();
    return { 
      response: data.message?.content || '', 
      latency: Date.now() - start,
      done: data.done
    };
  } catch (e) {
    return { response: '', latency: -1, error: e.message };
  }
}

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

export default async function llmBenchmark() {
  console.log('\n📊 Ollama LLM Benchmark\n');
  console.log('Available models: qwen2.5:3b, qwen2.5:0.5b, gemma3:latest\n');

  const results = {
    models: {},
    summary: {}
  };

  const models = ['qwen2.5:0.5b', 'qwen2.5:3b'];
  const testCases = [
    {
      name: 'Simple recall',
      prompt: 'User said: "My cat is named Luna". Question: What is the name of the user\'s cat?',
      expected: 'Luna'
    },
    {
      name: 'Fact extraction',
      prompt: 'User said: "I work at Amazon as a Senior Software Engineer". Question: Where does the user work?',
      expected: 'Amazon'
    },
    {
      name: 'Multi-fact recall',
      prompt: 'User said: "My manager Sarah wants results by end of quarter". Question: Who is the manager and what is the deadline?',
      expected: 'Sarah'
    }
  ];

  for (const model of models) {
    console.log(`\n${'═'.repeat(50)}`);
    console.log(`🤖 Testing: ${model}`);
    console.log('═'.repeat(50));

    const modelResults = {
      latency: [],
      accuracy: { correct: 0, total: testCases.length }
    };

    for (const test of testCases) {
      const messages = [
        { role: 'system', content: 'You are a helpful assistant that answers questions about user memories. Keep answers short and factual.' },
        { role: 'user', content: test.prompt }
      ];

      const { response, latency } = await generateChat(model, messages);
      
      console.log(`\n  ${test.name}:`);
      console.log(`    Latency: ${latency}ms`);
      console.log(`    Response: ${response.substring(0, 50)}...`);
      console.log(`    Expected: ${test.expected}`);

      modelResults.latency.push(latency);

      if (response.toLowerCase().includes(test.expected.toLowerCase())) {
        modelResults.accuracy.correct++;
        console.log(`    ✅ Correct`);
      } else {
        console.log(`    ❌ Incorrect`);
      }
    }

    const avgLatency = Math.round(modelResults.latency.reduce((a, b) => a + b, 0) / modelResults.latency.length);
    const accuracy = Math.round((modelResults.accuracy.correct / modelResults.accuracy.total) * 100);

    console.log(`\n  📊 ${model} Summary:`);
    console.log(`     Average latency: ${avgLatency}ms`);
    console.log(`     Accuracy: ${accuracy}%`);

    results.models[model] = {
      avgLatency,
      accuracy,
      tests: modelResults.accuracy.total
    };
  }

  console.log('\n\n' + '═'.repeat(50));
  console.log('📊 MODEL COMPARISON');
  console.log('═'.repeat(50));
  console.log('┌────────────────┬──────────────┬────────────┬────────────┐');
  console.log('│ Model          │ Avg Latency  │ Accuracy   │ Size       │');
  console.log('├────────────────┼──────────────┼────────────┼────────────┤');
  
  for (const [model, data] of Object.entries(results.models)) {
    const size = model.includes('0.5b') ? '494M' : '3.1B';
    const status = data.accuracy >= 80 ? '✅' : data.accuracy >= 60 ? '🟡' : '❌';
    console.log(`│ ${model.padEnd(14)} │ ${String(data.avgLatency + 'ms').padStart(12)} │ ${status} ${String(data.accuracy + '%').padStart(6)} │ ${size.padStart(8)} │`);
  }
  console.log('└────────────────┴──────────────┴────────────┴────────────┘');

  results.summary = {
    fastestModel: Object.entries(results.models).sort((a, b) => a[1].avgLatency - b[1].avgLatency)[0][0],
    mostAccurate: Object.entries(results.models).sort((a, b) => b[1].accuracy - a[1].accuracy)[0][0]
  };

  console.log(`\n🏆 Fastest: ${results.summary.fastestModel}`);
  console.log(`🏆 Most Accurate: ${results.summary.mostAccurate}`);

  return results;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  llmBenchmark();
}
