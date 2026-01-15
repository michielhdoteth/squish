import express from 'express';
import cors from 'cors';
import { getRecentMemories } from '../../features/memory/memories.js';
import { getObservationsForProject } from '../../core/observations.js';
import { getProjectByPath } from '../../core/projects.js';
const app = express();
const PORT = process.env.SQUISH_WEB_PORT || 37777;
app.use(cors());
app.use(express.json());
// Health check endpoint
app.get('/api/health', async (req, res) => {
    try {
        let project = null;
        let dbStatus = 'ok';
        try {
            // Try to access database directly to check availability
            const { checkDatabaseHealth } = await import('../../db/index.js');
            const dbOk = await checkDatabaseHealth();
            dbStatus = dbOk ? 'ok' : 'unavailable';
            if (dbOk) {
                const projectPath = process.cwd();
                project = await getProjectByPath(projectPath);
            }
        }
        catch (dbError) {
            if (dbError.message?.includes('Database unavailable') ||
                dbError.message?.includes('not a valid Win32 application')) {
                dbStatus = 'unavailable';
            }
            else {
                dbStatus = 'error';
            }
        }
        res.json({
            status: dbStatus === 'ok' ? 'ok' : 'degraded',
            version: '0.1.0',
            database: dbStatus,
            project: project ? { id: project.id, name: project.name, path: project.path } : null,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        res.status(500).json({
            status: 'error',
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
// Get recent memories
app.get('/api/memories', async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit) || 50, 200);
        const projectPath = req.query.project || process.cwd();
        const memories = await getRecentMemories(projectPath, limit);
        res.json({
            status: 'ok',
            data: memories,
            count: memories.length
        });
    }
    catch (error) {
        if (error.message?.includes('Database unavailable')) {
            res.status(503).json({
                status: 'unavailable',
                error: 'Database unavailable - memory retrieval disabled',
                data: [],
                count: 0
            });
        }
        else {
            res.status(500).json({
                status: 'error',
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }
});
// Get observations for project
app.get('/api/observations', async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit) || 50, 200);
        const projectPath = req.query.project || process.cwd();
        const observations = await getObservationsForProject(projectPath, limit);
        res.json({
            status: 'ok',
            data: observations,
            count: observations.length
        });
    }
    catch (error) {
        if (error.message?.includes('Database unavailable')) {
            res.status(503).json({
                status: 'unavailable',
                error: 'Database unavailable - observation retrieval disabled',
                data: [],
                count: 0
            });
        }
        else {
            res.status(500).json({
                status: 'error',
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }
});
// Get project context (combination of memories and observations)
app.get('/api/context', async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit) || 20, 100);
        const projectPath = req.query.project || process.cwd();
        let project = null;
        let memories = [];
        let observations = [];
        try {
            project = await getProjectByPath(projectPath);
        }
        catch (dbError) {
            if (!dbError.message?.includes('Database unavailable')) {
                throw dbError;
            }
        }
        try {
            memories = await getRecentMemories(projectPath, limit);
        }
        catch (dbError) {
            if (!dbError.message?.includes('Database unavailable')) {
                throw dbError;
            }
        }
        try {
            observations = await getObservationsForProject(projectPath, limit);
        }
        catch (dbError) {
            if (!dbError.message?.includes('Database unavailable')) {
                throw dbError;
            }
        }
        res.json({
            status: memories.length > 0 || observations.length > 0 ? 'ok' : 'degraded',
            project: project ? { id: project.id, name: project.name, path: project.path } : null,
            memories: memories,
            observations: observations,
            totalCount: memories.length + observations.length
        });
    }
    catch (error) {
        if (error.message?.includes('Database unavailable')) {
            res.status(503).json({
                status: 'unavailable',
                error: 'Database unavailable - context retrieval disabled',
                project: null,
                memories: [],
                observations: [],
                totalCount: 0
            });
        }
        else {
            res.status(500).json({
                status: 'error',
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }
});
// Web UI
app.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Squish Memory Viewer</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #0f0f0f;
            color: #e0e0e0;
            line-height: 1.6;
        }

        .container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
        }

        h1 {
            color: #00d4aa;
            text-align: center;
            margin-bottom: 30px;
            font-size: 2.5em;
        }

        .stats {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }

        .stat-card {
            background: #1a1a1a;
            border: 1px solid #333;
            border-radius: 8px;
            padding: 20px;
            text-align: center;
        }

        .stat-number {
            font-size: 2em;
            font-weight: bold;
            color: #00d4aa;
        }

        .stat-label {
            color: #888;
            margin-top: 5px;
        }

        .section {
            margin-bottom: 40px;
        }

        .section h2 {
            color: #00d4aa;
            margin-bottom: 20px;
            padding-bottom: 10px;
            border-bottom: 2px solid #00d4aa;
        }

        .item-grid {
            display: grid;
            gap: 15px;
        }

        .item {
            background: #1a1a1a;
            border: 1px solid #333;
            border-radius: 8px;
            padding: 20px;
        }

        .item-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 10px;
        }

        .item-type {
            background: #00d4aa;
            color: #000;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 0.8em;
            font-weight: bold;
        }

        .item-time {
            color: #888;
            font-size: 0.9em;
        }

        .item-content {
            color: #e0e0e0;
            margin-bottom: 10px;
        }

        .item-meta {
            font-size: 0.9em;
            color: #888;
        }

        .loading {
            text-align: center;
            padding: 40px;
            color: #888;
        }

        .error {
            background: #2a1a1a;
            border: 1px solid #8b4513;
            border-radius: 8px;
            padding: 20px;
            margin: 20px 0;
            color: #ffa07a;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🧠 Squish Memory Viewer</h1>

        <div id="stats" class="stats">
            <div class="stat-card">
                <div class="stat-number" id="memories-count">-</div>
                <div class="stat-label">Memories</div>
            </div>
            <div class="stat-card">
                <div class="stat-number" id="observations-count">-</div>
                <div class="stat-label">Observations</div>
            </div>
            <div class="stat-card">
                <div class="stat-number" id="total-count">-</div>
                <div class="stat-label">Total Items</div>
            </div>
            <div class="stat-card">
                <div class="stat-number" id="status">🟢</div>
                <div class="stat-label">Status</div>
            </div>
        </div>

        <div id="error" class="error" style="display: none;"></div>

        <div class="section">
            <h2>🧠 Recent Memories</h2>
            <div id="memories" class="item-grid">
                <div class="loading">Loading memories...</div>
            </div>
        </div>

        <div class="section">
            <h2>👁️ Recent Observations</h2>
            <div id="observations" class="item-grid">
                <div class="loading">Loading observations...</div>
            </div>
        </div>
    </div>

    <script>
        async function loadData() {
            try {
                const response = await fetch('/api/context');
                const data = await response.json();

                if (data.status === 'ok') {
                    document.getElementById('memories-count').textContent = data.memories.length;
                    document.getElementById('observations-count').textContent = data.observations.length;
                    document.getElementById('total-count').textContent = data.totalCount;
                    document.getElementById('status').textContent = '🟢 OK';

                    renderMemories(data.memories);
                    renderObservations(data.observations);
                } else {
                    showError('Failed to load data: ' + (data.error || 'Unknown error'));
                }
            } catch (error) {
                showError('Failed to load data: ' + error.message);
            }
        }

        function renderMemories(memories) {
            const container = document.getElementById('memories');
            if (memories.length === 0) {
                container.innerHTML = '<div class="loading">No memories found</div>';
                return;
            }

            container.innerHTML = memories.map(memory => \`
                <div class="item">
                    <div class="item-header">
                        <span class="item-type">\${memory.type}</span>
                        <span class="item-time">\${formatTime(memory.createdAt)}</span>
                    </div>
                    <div class="item-content">\${escapeHtml(memory.content)}</div>
                    <div class="item-meta">
                        Tags: \${memory.tags.join(', ') || 'none'} |
                        Project: \${memory.projectId || 'unknown'}
                    </div>
                </div>
            \`).join('');
        }

        function renderObservations(observations) {
            const container = document.getElementById('observations');
            if (observations.length === 0) {
                container.innerHTML = '<div class="loading">No observations found</div>';
                return;
            }

            container.innerHTML = observations.map(obs => \`
                <div class="item">
                    <div class="item-header">
                        <span class="item-type">\${obs.type}</span>
                        <span class="item-time">\${formatTime(obs.createdAt)}</span>
                    </div>
                    <div class="item-content">\${escapeHtml(obs.summary)}</div>
                    <div class="item-meta">
                        Action: \${obs.action} |
                        Target: \${obs.target || 'none'}
                    </div>
                </div>
            \`).join('');
        }

        function formatTime(timestamp) {
            if (!timestamp) return 'Unknown';
            const date = new Date(timestamp);
            return date.toLocaleString();
        }

        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        function showError(message) {
            document.getElementById('error').textContent = message;
            document.getElementById('error').style.display = 'block';
            document.getElementById('status').textContent = '🔴 Error';
        }

        // Load data on page load
        loadData();

        // Refresh every 30 seconds
        setInterval(loadData, 30000);
    </script>
</body>
</html>
  `);
});
// Start server
export function startWebServer() {
    app.listen(PORT, () => {
        console.log(`[squish] Web UI available at http://localhost:${PORT}`);
    });
}
export default app;
//# sourceMappingURL=web.js.map