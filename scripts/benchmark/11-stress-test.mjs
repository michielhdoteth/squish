#!/usr/bin/env node

import http from 'http';

const OLLAMA_URL = 'http://localhost:11434';
const BASE_URL = 'http://localhost:37777';

async function generateEmbedding(text) {
  const start = Date.now();
  try {
    const response = await fetch(`${OLLAMA_URL}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'nomic-embed-text', prompt: text })
    });
    const data = await response.json();
    return { latency: Date.now() - start };
  } catch (e) {
    return { latency: -1 };
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
    await response.json();
    return { latency: Date.now() - start };
  } catch (e) {
    return { latency: -1 };
  }
}

async function httpRequest(path, method = 'GET') {
  const start = Date.now();
  return new Promise((resolve) => {
    const url = new URL(path, BASE_URL);
    const req = http.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method,
      timeout: 5000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, latency: Date.now() - start }));
    });
    req.on('error', () => resolve({ status: 0, latency: Date.now() - start }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, latency: Date.now() - start }); });
    req.end();
  });
}

async function runStressTest() {
  console.log('\n📊 Stress & Concurrency Test\n');
  
  const results = { concurrent: {}, throughput: {}, summary: {} };
  
  console.log('=== Concurrent Operations ===\n');
  
  const concurrencyLevels = [1, 5, 10, 25, 50];
  
  console.log('┌────────────┬────────────┬────────────┬────────────┬────────────┐');
  console.log('│ Concurrent │ Total Ops │ Successful │ Avg Latency│ Throughput │');
  console.log('├────────────┼────────────┼────────────┼────────────┼────────────┤');
  
  for (const level of concurrencyLevels) {
    const operations = [];
    const startTime = Date.now();
    
    for (let i = 0; i < level; i++) {
      operations.push(generateEmbedding(`Test memory number ${i} with some content`));
    }
    
    const results_batch = await Promise.all(operations);
    const totalTime = Date.now() - startTime;
    
    const successful = results_batch.filter(r => r.latency > 0).length;
    const totalLatency = results_batch.reduce((sum, r) => sum + (r.latency > 0 ? r.latency : 0), 0);
    const avgLatency = successful > 0 ? Math.round(totalLatency / successful) : 0;
    const throughput = Math.round((level / totalTime) * 1000);
    
    console.log(`│ ${String(level).padStart(10)} │ ${String(level).padStart(10)} │ ${String(successful).padStart(10)} │ ${String(avgLatency + 'ms').padStart(10)} │ ${String(throughput + '/s').padStart(10)} │`);
    
    results.concurrent[level] = { total: level, successful, avgLatency, throughput };
  }
  
  console.log('└────────────┴────────────┴────────────┴────────────┴────────────┘');
  
  console.log('\n=== Batch Memory Operations ===\n');
  
  const batchSizes = [10, 25, 50, 100];
  
  console.log('┌────────────┬────────────┬────────────┬────────────────┐');
  console.log('│ Batch Size │ Total Time │ Avg per Op │ Status         │');
  console.log('├────────────┼────────────┼────────────┼────────────────┤');
  
  for (const size of batchSizes) {
    const operations = [];
    const startTime = Date.now();
    
    for (let i = 0; i < size; i++) {
      operations.push(generateEmbedding(`Memory content ${i}: Some important fact to remember about the user`));
    }
    
    await Promise.all(operations);
    const totalTime = Date.now() - startTime;
    const avgPerOp = Math.round(totalTime / size);
    const throughput = Math.round((size / totalTime) * 1000);
    
    console.log(`│ ${String(size).padStart(10)} │ ${String(totalTime + 'ms').padStart(10)} │ ${String(avgPerOp + 'ms').padStart(10)} │ ${String(throughput + '/s').padStart(14)} │`);
    
    results.throughput[size] = { totalTime, avgPerOp, throughput };
  }
  
  console.log('└────────────┴────────────┴────────────┴────────────────┘');
  
  console.log('\n=== Rate Limiting Test ===\n');
  
  const requests = 120;
  const windowMs = 15000;
  const windowStart = Date.now();
  
  console.log(`Sending ${requests} rapid requests to test rate limiting...`);
  
  const rateTestPromises = [];
  for (let i = 0; i < requests; i++) {
    rateTestPromises.push(
      httpRequest('/api/health').then(r => ({ ...r, index: i }))
    );
  }
  
  const rateResults = await Promise.all(rateTestPromises);
  const totalTime = Date.now() - windowStart;
  
  const success200 = rateResults.filter(r => r.status === 200).length;
  const success429 = rateResults.filter(r => r.status === 429).length;
  const errors = rateResults.filter(r => r.status === 0).length;
  
  console.log(`\nResults after ${totalTime}ms:`);
  console.log(`  200 OK: ${success200}`);
  console.log(`  429 Rate Limited: ${success429}`);
  console.log(`  Errors: ${errors}`);
  
  if (success429 > 0) {
    console.log('\n✅ Rate limiting is working!');
    results.rateLimit = { working: true, limited: success429 };
  } else {
    console.log('\n⚠️  Rate limiting may not be configured');
    results.rateLimit = { working: false, limited: 0 };
  }
  
  console.log('\n=== Summary ===\n');
  
  const maxConcurrent = Math.max(...Object.keys(results.concurrent).map(Number));
  const maxThroughput = Math.max(...Object.values(results.concurrent).map(r => r.throughput));
  
  console.log('┌────────────────────┬────────────────┐');
  console.log('│ Metric            │ Value          │');
  console.log('├────────────────────┼────────────────┤');
  console.log(`│ Max concurrent ops│ ${String(maxConcurrent).padStart(13)} │`);
  console.log(`│ Max throughput     │ ${String(maxThroughput + '/s').padStart(13)} │`);
  console.log(`│ Rate limit active  │ ${String(results.rateLimit.working ? 'Yes' : 'No').padStart(13)} │`);
  console.log('└────────────────────┴────────────────┘');
  
  results.summary = {
    maxConcurrent,
    maxThroughput,
    rateLimitWorking: results.rateLimit.working
  };
  
  return results;
}

runStressTest().then(r => {
  console.log('\n✅ Stress test complete');
  process.exit(0);
}).catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
