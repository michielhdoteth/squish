#!/usr/bin/env node

import http from 'http';

const BASE_URL = 'http://localhost:37777';

async function httpRequest(path, method = 'GET', body = null) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {}
    };
    
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({ status: res.statusCode, data, latency: Date.now() - start });
      });
    });
    
    req.on('error', (e) => resolve({ status: 0, error: e.message, latency: Date.now() - start }));
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function runWebAPIBenchmark() {
  console.log('\n📊 Web API Benchmark\n');
  
  const results = { endpoints: {}, summary: {} };
  
  console.log('⚠️  Note: Web server must be running (squish run web)\n');
  
  const tests = [
    { name: 'health', path: '/api/health', method: 'GET' },
    { name: 'projects', path: '/api/projects', method: 'GET' },
    { name: 'stats', path: '/api/stats', method: 'GET' },
    { name: 'memories_recent', path: '/api/memories?limit=10', method: 'GET' },
    { name: 'observations_recent', path: '/api/observations?limit=10', method: 'GET' },
  ];
  
  console.log('┌────────────────────┬────────┬────────┬────────┐');
  console.log('│ Endpoint           │ Status │ Latency│ Cache  │');
  console.log('├────────────────────┼────────┼────────┼────────┤');
  
  let totalLatency = 0;
  let successCount = 0;
  
  for (const test of tests) {
    const { status, latency, error } = await httpRequest(test.path, test.method);
    
    const statusStr = status === 200 ? '✅ 200' : status === 0 ? '❌ ERR' : `⚠️  ${status}`;
    const latencyStr = error ? 'N/A' : `${latency}ms`;
    const cached = status === 200 ? (latency < 50 ? '✅' : '⚠️') : '❌';
    
    console.log(`│ ${test.name.padEnd(18)} │ ${statusStr.padStart(6)} │ ${latencyStr.padStart(6)} │ ${cached}      │`);
    
    results.endpoints[test.name] = { status, latency, error };
    
    if (status === 200) {
      totalLatency += latency;
      successCount++;
    }
  }
  
  console.log('└────────────────────┴────────┴────────┴────────┘');
  
  const avgLatency = successCount > 0 ? Math.round(totalLatency / successCount) : 0;
  
  console.log(`\n📊 Summary:`);
  console.log(`   Successful: ${successCount}/${tests.length}`);
  console.log(`   Average latency: ${avgLatency}ms`);
  
  results.summary = { successCount, totalTests: tests.length, avgLatency };
  
  return results;
}

runWebAPIBenchmark().then(r => {
  console.log('\n✅ Web API benchmark complete');
  process.exit(0);
}).catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
