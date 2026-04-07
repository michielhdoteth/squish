#!/usr/bin/env node

import http from 'http';

const BASE_URL = 'http://localhost:37777';

async function httpRequest(path, method = 'GET', body = null) {
  const start = Date.now();
  return new Promise((resolve) => {
    const url = new URL(path, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {}
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const latency = Date.now() - start;
        let parsed = null;
        try { parsed = JSON.parse(data); } catch (e) {}
        resolve({
          status: res.statusCode,
          data,
          parsed,
          latency,
          size: Buffer.byteLength(data, 'utf8')
        });
      });
    });

    req.on('error', (e) => resolve({ status: 0, error: e.message, latency: Date.now() - start }));
    req.setTimeout(10000, () => { req.destroy(); resolve({ status: 0, error: 'timeout', latency: Date.now() - start }); });
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function runWebAPIBenchmark() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║  Web API Full Benchmark                               ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  const results = { endpoints: {}, summary: {} };

  console.log('⚠️  Note: Web server must be running (squish run web)\n');

  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log('  GET ENDPOINTS');
  console.log('═══════════════════════════════════════════════════════════════════════\n');

  const getTests = [
    { name: 'health', path: '/api/health' },
    { name: 'stats', path: '/api/stats' },
    { name: 'projects', path: '/api/projects' },
    { name: 'memories_recent', path: '/api/memories?limit=10' },
    { name: 'memories_paginated', path: '/api/memories?limit=5&offset=0' },
    { name: 'observations_recent', path: '/api/observations?limit=10' },
    { name: 'context', path: '/api/context?projectPath=/test' },
    { name: 'root', path: '/' },
  ];

  console.log('┌──────────────────────┬────────┬────────┬──────────┬──────────┐');
  console.log('│ Endpoint            │ Status │ Latency│ Size    │ Cache    │');
  console.log('├──────────────────────┼────────┼────────┼──────────┼──────────┤');

  let getSuccess = 0;
  let getTotalLatency = 0;

  for (const test of getTests) {
    const result = await httpRequest(test.path);
    const status = result.status === 200 ? '✅' : result.status === 404 ? '⚠️ ' : '❌';
    const cached = result.latency < 50 && result.status === 200 ? '✅' : result.latency > 200 ? '⚠️ ' : '⬜';
    console.log(`│ ${test.name.padEnd(20)} │ ${status} ${String(result.status).padStart(4)} │ ${String(result.latency + 'ms').padStart(6)} │ ${formatBytes(result.size).padStart(7)} │ ${cached}        │`);
    
    results.endpoints[test.name] = result;
    if (result.status === 200) { getSuccess++; getTotalLatency += result.latency; }
  }
  console.log('└──────────────────────┴────────┴────────┴──────────┴──────────┘');

  console.log('\n═══════════════════════════════════════════════════════════════════════');
  console.log('  POST ENDPOINTS');
  console.log('═══════════════════════════════════════════════════════════════════════\n');

  const postTests = [
    {
      name: 'create_memory',
      path: '/api/memories',
      body: {
        content: 'Test memory from benchmark',
        projectPath: '/test',
        type: 'note',
        importance: 5
      }
    },
    {
      name: 'create_observation',
      path: '/api/observations',
      body: {
        content: 'Test observation from benchmark',
        projectPath: '/test',
        type: 'action'
      }
    }
  ];

  console.log('┌──────────────────────┬────────┬────────┬──────────┐');
  console.log('│ Endpoint            │ Status │ Latency│ Size    │');
  console.log('├──────────────────────┼────────┼────────┼──────────┤');

  let createdIds = {};
  let postSuccess = 0;

  for (const test of postTests) {
    const result = await httpRequest(test.path, 'POST', test.body);
    const status = result.status === 200 || result.status === 201 ? '✅' : result.status === 0 ? '❌' : '⚠️ ';
    console.log(`│ ${test.name.padEnd(20)} │ ${status} ${String(result.status).padStart(4)} │ ${String(result.latency + 'ms').padStart(6)} │ ${formatBytes(result.size).padStart(7)} │`);
    
    if (result.parsed?.id) {
      createdIds[test.name] = result.parsed.id;
    }
    results.endpoints[test.name] = result;
    if (result.status === 200 || result.status === 201) postSuccess++;
  }
  console.log('└──────────────────────┴────────┴────────┴──────────┘');

  console.log('\n═══════════════════════════════════════════════════════════════════════');
  console.log('  DEFAULTS & ERROR HANDLING');
  console.log('═══════════════════════════════════════════════════════════════════════\n');

  const errorTests = [
    { name: '404_route', path: '/api/nonexistent' },
    { name: 'empty_limit', path: '/api/memories?limit=' },
    { name: 'invalid_json', path: '/api/memories', method: 'POST', body: { invalid: 'data' } },
  ];

  console.log('┌──────────────────────┬────────┬─────────────────────────────┐');
  console.log('│ Test                │ Status │ Response                 │');
  console.log('├──────────────────────┼────────┼─────────────────────────────┤');

  for (const test of errorTests) {
    const result = await httpRequest(test.path, test.method || 'GET', test.body);
    const status = result.status === 404 ? '✅' : result.status === 400 ? '✅' : result.status === 0 ? '⚠️ ' : '⬜';
    const msg = result.parsed?.error?.substring(0, 25) || result.status || 'timeout';
    console.log(`│ ${test.name.padEnd(20)} │ ${status} ${String(result.status).padStart(4)} │ ${msg.padEnd(25)} │`);
  }
  console.log('└──────────────────────┴────────┴─────────────────────────────┘');

  console.log('\n═══════════════════════════════════════════════════════════════════════');
  console.log('  SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════════════\n');

  const avgGetLatency = getSuccess > 0 ? Math.round(getTotalLatency / getSuccess) : 0;
  const totalEndpoints = getTests.length + postTests.length;
  const totalSuccess = getSuccess + postSuccess;

  console.log('┌───────────────────────────────────────────────────────────────┐');
  console.log(`│  GET Endpoints:        ${getSuccess}/${getTests.length} successful, avg ${avgGetLatency}ms latency       │`);
  console.log(`│  POST Endpoints:       ${postSuccess}/${postTests.length} successful                           │`);
  console.log(`│  Total Success Rate:   ${totalSuccess}/${totalEndpoints} (${Math.round(totalSuccess/totalEndpoints*100)}%)                            │`);
  console.log('└───────────────────────────────────────────────────────────────┘');

  results.summary = {
    getSuccess,
    getTotal: getTests.length,
    postSuccess,
    postTotal: postTests.length,
    avgGetLatency
  };

  return results;
}

function formatBytes(bytes) {
  if (bytes === 0 || !bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

runWebAPIBenchmark().then(r => {
  console.log('\n✅ Web API benchmark complete');
  process.exit(0);
}).catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
