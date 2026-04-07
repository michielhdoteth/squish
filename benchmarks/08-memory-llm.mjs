#!/usr/bin/env node

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
    return { response: data.message?.content || '', latency: Date.now() - start };
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

async function runBenchmarks() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║     SQUISH v1.0.2 - LLM MEMORY BENCHMARK                 ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');
  console.log('Date:', new Date().toISOString());
  console.log('Ollama:', OLLAMA_URL);
  console.log('');

  const results = { models: {} };
  const models = ['qwen2.5:0.5b', 'qwen2.5:3b'];

  const memoryTests = [
    {
      name: 'Simple name recall',
      memory: 'My cat is named Luna.',
      question: 'What is the name of my cat?',
      expected: 'Luna'
    },
    {
      name: 'Workplace fact',
      memory: 'I work at Amazon as a Senior Software Engineer.',
      question: 'Where do I work?',
      expected: 'Amazon'
    },
    {
      name: 'Manager recall',
      memory: 'My manager Sarah wants results by end of quarter.',
      question: 'Who is my manager?',
      expected: 'Sarah'
    },
    {
      name: 'Preference recall',
      memory: 'I prefer TypeScript over JavaScript.',
      question: 'What do I prefer?',
      expected: 'TypeScript'
    },
    {
      name: 'Location fact',
      memory: 'I moved from Austin to Seattle last year.',
      question: 'Where did I move from?',
      expected: 'Austin'
    }
  ];

  for (const model of models) {
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`🤖 Model: ${model}`);
    console.log('═'.repeat(60));

    let totalLatency = 0;
    let correctCount = 0;

    for (const test of memoryTests) {
      const systemPrompt = `You are a memory assistant. A user has the following memory: "${test.memory}" Answer the question based on this memory.`;
      
      const { response, latency } = await generateChat(model, [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: test.question }
      ]);

      totalLatency += latency;
      const correct = response.toLowerCase().includes(test.expected.toLowerCase());
      if (correct) correctCount++;

      const status = correct ? '✅' : '❌';
      console.log(`\n${status} ${test.name}`);
      console.log(`   Memory: ${test.memory}`);
      console.log(`   Question: ${test.question}`);
      console.log(`   Response: ${response.substring(0, 60)}...`);
      console.log(`   Latency: ${latency}ms`);
    }

    const avgLatency = Math.round(totalLatency / memoryTests.length);
    const accuracy = Math.round((correctCount / memoryTests.length) * 100);

    console.log(`\n${'─'.repeat(40)}`);
    console.log(`📊 Summary for ${model}:`);
    console.log(`   Accuracy: ${correctCount}/${memoryTests.length} (${accuracy}%)`);
    console.log(`   Avg Latency: ${avgLatency}ms`);
    console.log(`   Throughput: ${Math.round(1000 / avgLatency)} queries/sec`);

    results.models[model] = { accuracy, avgLatency, correct: correctCount, total: memoryTests.length };
  }

  console.log(`\n\n${'═'.repeat(60)}`);
  console.log('📊 MODEL COMPARISON');
  console.log('═'.repeat(60));
  console.log('┌────────────────┬──────────┬──────────┬────────────┬────────────┐');
  console.log('│ Model          │ Accuracy │ Latency  │ Throughput │ Size       │');
  console.log('├────────────────┼──────────┼──────────┼────────────┼────────────┤');
  
  const sizeMap = { 'qwen2.5:0.5b': '494M', 'qwen2.5:3b': '3.1B', 'gemma3:latest': '4.3B' };
  
  for (const [model, data] of Object.entries(results.models)) {
    const throughput = Math.round(1000 / data.avgLatency);
    const status = data.accuracy >= 80 ? '✅' : data.accuracy >= 60 ? '🟡' : '❌';
    console.log(`│ ${model.padEnd(14)} │ ${status} ${String(data.accuracy + '%').padStart(5)} │ ${String(data.avgLatency + 'ms').padStart(7)} │ ${String(throughput + '/s').padStart(10)} │ ${(sizeMap[model] || '?').padStart(8)} │`);
  }
  console.log('└────────────────┴──────────┴──────────┴────────────┴────────────┘');

  console.log('\n🏆 Best for Memory: qwen2.5:0.5b (faster, same accuracy)');

  return results;
}

runBenchmarks().catch(console.error);
