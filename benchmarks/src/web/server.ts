/**
 * Web UI Server for Inspecting Benchmark Runs
 */

import express from 'express';
import { readdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import type { RunCheckpoint, BenchmarkReport } from '../types/index.js';

const RUNS_DIR = process.env.RUNS_DIR || './data/runs';

export async function serveWebUI(port: number): Promise<void> {
  const app = express();

  app.use(express.json());
  app.use(express.static(join(process.cwd(), 'src/web/static')));

  // API: List all runs
  app.get('/api/runs', (req, res) => {
    if (!existsSync(RUNS_DIR)) {
      return res.json([]);
    }

    const runs = readdirSync(RUNS_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => {
        const checkpointPath = join(RUNS_DIR, d.name, 'checkpoint.json');
        if (!existsSync(checkpointPath)) return null;

        const checkpoint: RunCheckpoint = JSON.parse(readFileSync(checkpointPath, 'utf-8'));
        return {
          runId: checkpoint.runId,
          status: checkpoint.status,
          provider: checkpoint.config.provider,
          benchmark: checkpoint.config.benchmark,
          progress: checkpoint.progress,
          startTime: checkpoint.startTime,
        };
      })
      .filter(Boolean);

    res.json(runs);
  });

  // API: Get run details
  app.get('/api/runs/:runId', (req, res) => {
    const checkpointPath = join(RUNS_DIR, req.params.runId, 'checkpoint.json');
    if (!existsSync(checkpointPath)) {
      return res.status(404).json({ error: 'Run not found' });
    }

    const checkpoint: RunCheckpoint = JSON.parse(readFileSync(checkpointPath, 'utf-8'));
    res.json(checkpoint);
  });

  // API: Get run report
  app.get('/api/runs/:runId/report', (req, res) => {
    const reportPath = join(RUNS_DIR, req.params.runId, 'report.json');
    if (!existsSync(reportPath)) {
      return res.status(404).json({ error: 'Report not found' });
    }

    const report: BenchmarkReport = JSON.parse(readFileSync(reportPath, 'utf-8'));
    res.json(report);
  });

  // API: Get question results
  app.get('/api/runs/:runId/results', (req, res) => {
    const resultsDir = join(RUNS_DIR, req.params.runId, 'results');
    if (!existsSync(resultsDir)) {
      return res.json([]);
    }

    const results = readdirSync(resultsDir)
      .filter(f => f.endsWith('.json'))
      .map(f => JSON.parse(readFileSync(join(resultsDir, f), 'utf-8')));

    res.json(results);
  });

  // HTML Dashboard
  app.get('/', (req, res) => {
    res.send(renderDashboard());
  });

  app.listen(port, () => {
    console.log(`Web UI running at http://localhost:${port}`);
  });
}

function renderDashboard(): string {
  return `<!DOCTYPE html>
<html>
<head>
  <title>MemoryBench - Benchmark Results</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; padding: 20px; }
    .container { max-width: 1200px; margin: 0 auto; }
    h1 { color: #333; margin-bottom: 20px; }
    .runs-grid { display: grid; gap: 15px; }
    .run-card { background: white; border-radius: 8px; padding: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    .run-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
    .run-id { font-weight: 600; color: #2563eb; }
    .status { padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: 500; }
    .status-completed { background: #dcfce7; color: #166534; }
    .status-failed { background: #fee2e2; color: #991b1b; }
    .status-running { background: #fef3c7; color: #92400e; }
    .run-meta { color: #666; font-size: 14px; margin-bottom: 10px; }
    .progress-bar { height: 8px; background: #e5e7eb; border-radius: 4px; overflow: hidden; }
    .progress-fill { height: 100%; background: #2563eb; transition: width 0.3s; }
    .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin-top: 15px; }
    .stat { text-align: center; }
    .stat-value { font-size: 24px; font-weight: 600; color: #333; }
    .stat-label { font-size: 12px; color: #666; text-transform: uppercase; }
    .refresh-btn { background: #2563eb; color: white; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; margin-bottom: 20px; }
    .refresh-btn:hover { background: #1d4ed8; }
  </style>
</head>
<body>
  <div class="container">
    <h1>MemoryBench Dashboard</h1>
    <button class="refresh-btn" onclick="loadRuns()">Refresh</button>
    <div id="runs-container" class="runs-grid"></div>
  </div>

  <script>
    async function loadRuns() {
      const container = document.getElementById('runs-container');
      container.innerHTML = '<p>Loading...</p>';
      
      try {
        const res = await fetch('/api/runs');
        const runs = await res.json();
        
        if (runs.length === 0) {
          container.innerHTML = '<p>No benchmark runs found.</p>';
          return;
        }
        
        container.innerHTML = runs.map(run => \`
          <div class="run-card">
            <div class="run-header">
              <span class="run-id">\${run.runId}</span>
              <span class="status status-\${run.status}">\${run.status}</span>
            </div>
            <div class="run-meta">
              \${run.provider} → \${run.benchmark} | 
              \${new Date(run.startTime).toLocaleString()}
            </div>
            <div class="progress-bar">
              <div class="progress-fill" style="width: \${(run.progress.completed / run.progress.total * 100) || 0}%"></div>
            </div>
            <div class="stats">
              <div class="stat">
                <div class="stat-value">\${run.progress.total}</div>
                <div class="stat-label">Total</div>
              </div>
              <div class="stat">
                <div class="stat-value">\${run.progress.completed}</div>
                <div class="stat-label">Completed</div>
              </div>
              <div class="stat">
                <div class="stat-value">\${run.progress.failed}</div>
                <div class="stat-label">Failed</div>
              </div>
            </div>
          </div>
        \`).join('');
      } catch (err) {
        container.innerHTML = '<p>Error loading runs: ' + err.message + '</p>';
      }
    }
    
    loadRuns();
    setInterval(loadRuns, 5000); // Auto-refresh every 5 seconds
  </script>
</body>
</html>`;
}
