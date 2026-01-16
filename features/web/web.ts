import express from 'express';
import cors from 'cors';

const app = express();
const PORT = process.env.SQUISH_WEB_PORT || 37777;

app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/api/health', async (req, res) => {
  res.json({
    status: 'ok',
    version: '0.1.0',
    database: 'ok',
    project: { id: 'demo', name: 'Demo Project', path: process.cwd() },
    timestamp: new Date().toISOString()
  });
});

// Get recent memories
app.get('/api/memories', async (req, res) => {
  const mockMemories = [
    {
      id: '1',
      type: 'conversation',
      content: 'User asked about implementing a new feature for the dashboard',
      tags: ['feature', 'dashboard'],
      projectId: 'demo',
      createdAt: new Date().toISOString()
    }
  ];

  res.json({
    status: 'ok',
    data: mockMemories,
    count: mockMemories.length
  });
});

// Get observations for project
app.get('/api/observations', async (req, res) => {
  const mockObservations = [
    {
      id: '1',
      type: 'tool_usage',
      summary: 'User ran a build command',
      action: 'build',
      target: 'project',
      createdAt: new Date().toISOString()
    }
  ];

  res.json({
    status: 'ok',
    data: mockObservations,
    count: mockObservations.length
  });
});

// Get project context
app.get('/api/context', async (req, res) => {
  const mockMemories = [
    {
      id: '1',
      type: 'conversation',
      content: 'Enhanced web UI with modern design',
      tags: ['ui', 'enhancement'],
      projectId: 'demo',
      createdAt: new Date().toISOString()
    }
  ];

  const mockObservations = [
    {
      id: '1',
      type: 'tool_usage',
      summary: 'Web UI server started successfully',
      action: 'start',
      target: 'server',
      createdAt: new Date().toISOString()
    }
  ];

  res.json({
    status: 'ok',
    project: { id: 'demo', name: 'Demo Project', path: process.cwd() },
    memories: mockMemories,
    observations: mockObservations,
    totalCount: mockMemories.length + mockObservations.length
  });
});

// Web UI
app.get('/', (req, res) => {
  const html = `<!DOCTYPE html>
<html class="dark" lang="en"><head>
<meta charset="utf-8"/>
<meta content="width=device-width, initial-scale=1.0" name="viewport"/>
<title>Squish Memory Viewer - Playful Dashboard</title>
<link href="https://fonts.googleapis.com" rel="preconnect"/>
<link crossorigin="" href="https://fonts.gstatic.com" rel="preconnect"/>
<link href="https://fonts.googleapis.com/css2?family=Spline+Sans:wght@300;400;500;600;700;800&amp;display=swap" rel="stylesheet"/>
<link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&amp;display=swap" rel="stylesheet"/>
<script src="https://cdn.tailwindcss.com?plugins=forms,container-queries"></script>
<script id="tailwind-config">
        tailwind.config = {
            darkMode: "class",
            theme: {
                extend: {
                    colors: {
                        "primary": "#00ffbf",
                        "secondary": "#ff6392",
                        "accent": "#ffcd26",
                        "background-dark": "#0f172a",
                        "card-bg": "#1e293b",
                        "text-main": "#f8fafc",
                        "text-muted": "#94a3b8",
                        "alert-orange": "rgba(251, 146, 60, 0.1)"
                    },
                    fontFamily: {
                        "display": ["Spline Sans", "sans-serif"]
                    },
                    borderRadius: {
                        "pill": "2.5rem",
                        "blob": "30% 70% 70% 30% / 30% 30% 70% 70%"
                    }
                },
            },
        }
    </script>
<style type="text/tailwindcss">
        @layer base {
            body { @apply font-display text-text-main bg-background-dark antialiased; }
        }
        .squish-pill {
            border-radius: 3rem;
        }
        .blob-alert {
            border-radius: 40% 60% 70% 30% / 40% 50% 60% 50%;
        }
        .squishy-hover {
            transition: transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        }
        .squishy-hover:hover {
            transform: scale(1.02) translateY(-4px);
        }
        .pulse-red {
            animation: pulse 2s infinite;
        }
        @keyframes pulse {
            0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7); }
            70% { transform: scale(1); box-shadow: 0 0 0 10px rgba(239, 68, 68, 0); }
            100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
        }
    </style>
</head>
<body class="min-h-screen selection:bg-primary/30 pb-20">
<header class="w-full px-6 py-8">
<div class="max-w-6xl mx-auto flex items-center justify-between">
<div class="flex items-center gap-4">
<div class="relative size-12 flex items-center justify-center">
<div class="absolute inset-0 bg-secondary/20 blur-xl rounded-full"></div>
<span class="material-symbols-outlined text-secondary text-5xl relative z-10">psychology</span>
</div>
<h1 class="text-3xl font-black tracking-tight flex items-center gap-2">
                    Squish <span class="text-primary italic">Memory Viewer</span>
</h1>
</div>
<div class="flex items-center gap-4">
<div class="bg-card-bg px-4 py-2 rounded-full border-2 border-slate-700/50 flex items-center gap-2">
<div class="size-2 rounded-full bg-primary animate-pulse"></div>
<span class="text-xs font-bold uppercase tracking-widest text-text-muted">Local Server: Online</span>
</div>
</div>
</div>
</header>
<main class="max-w-6xl mx-auto px-6 space-y-12">
<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
<div class="bg-card-bg p-8 squish-pill border-2 border-slate-700/30 text-center squishy-hover shadow-xl">
<p class="text-4xl font-black mb-1" id="memories-count">-</p>
<p class="text-sm font-bold uppercase tracking-widest text-text-muted italic">Memories</p>
</div>
<div class="bg-card-bg p-8 squish-pill border-2 border-slate-700/30 text-center squishy-hover shadow-xl">
<p class="text-4xl font-black mb-1" id="observations-count">-</p>
<p class="text-sm font-bold uppercase tracking-widest text-text-muted italic">Observations</p>
</div>
<div class="bg-card-bg p-8 squish-pill border-2 border-slate-700/30 text-center squishy-hover shadow-xl">
<p class="text-4xl font-black mb-1" id="total-count">-</p>
<p class="text-sm font-bold uppercase tracking-widest text-text-muted italic">Total Items</p>
</div>
<div class="bg-card-bg p-8 squish-pill border-2 border-slate-700/30 flex flex-col items-center justify-center squishy-hover shadow-xl">
<div class="flex items-center gap-3">
<div class="size-4 bg-red-500 rounded-full pulse-red"></div>
<p class="text-2xl font-black text-red-400 italic">Error</p>
</div>
<p class="text-sm font-bold uppercase tracking-widest text-text-muted italic mt-1">Status</p>
</div>
</div>
<div class="relative py-6 px-10 bg-orange-500/10 border-2 border-orange-500/20 blob-alert flex items-center gap-6 overflow-hidden">
<div class="absolute top-0 left-0 w-full h-full bg-orange-500/5 -z-10"></div>
<span class="material-symbols-outlined text-orange-400 text-3xl">warning</span>
<div>
<h4 class="font-black text-orange-400 italic uppercase text-sm tracking-wider">Communication Breakdown</h4>
<p class="text-orange-200/80 font-medium">Failed to load data: Unknown error. Is the blob server running?</p>
</div>
</div>
<div class="grid grid-cols-1 lg:grid-cols-2 gap-12">
<section class="space-y-6">
<div class="flex items-center gap-4 border-b-4 border-primary/20 pb-4">
<div class="size-10 bg-primary/20 rounded-full flex items-center justify-center border-2 border-primary">
<span class="material-symbols-outlined text-primary font-bold">neurology</span>
</div>
<h2 class="text-2xl font-black italic text-primary uppercase">Recent Memories</h2>
</div>
<div class="space-y-4" id="memories">
<div class="bg-card-bg/50 p-6 rounded-3xl border-2 border-slate-700/20 flex flex-col items-center justify-center py-16 opacity-60">
<div class="size-12 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4"></div>
<p class="font-black italic text-text-muted">Loading memories...</p>
</div>
</div>
</section>
<section class="space-y-6">
<div class="flex items-center gap-4 border-b-4 border-primary/20 pb-4">
<div class="size-10 bg-primary/20 rounded-full flex items-center justify-center border-2 border-primary">
<span class="material-symbols-outlined text-primary font-bold">visibility</span>
</div>
<h2 class="text-2xl font-black italic text-primary uppercase">Recent Observations</h2>
</div>
<div class="space-y-4" id="observations">
<div class="bg-card-bg/50 p-6 rounded-3xl border-2 border-slate-700/20 flex flex-col items-center justify-center py-16 opacity-60">
<div class="size-12 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4"></div>
<p class="font-black italic text-text-muted">Loading observations...</p>
</div>
</div>
</section>
</div>
<div class="pt-12 flex justify-center">
<div class="bg-card-bg border-4 border-slate-700/50 p-2 rounded-full flex gap-2">
<button class="bg-primary text-black px-8 py-3 rounded-full font-black text-sm uppercase hover:scale-105 transition-transform flex items-center gap-2">
<span class="material-symbols-outlined text-sm">refresh</span>
                    Reconnect
                </button>
<button class="text-text-main px-8 py-3 rounded-full font-black text-sm uppercase hover:bg-slate-700/50 transition-colors" onclick="openDocs()">
                    Docs
                </button>
<button class="text-text-main px-8 py-3 rounded-full font-black text-sm uppercase hover:bg-slate-700/50 transition-colors" onclick="openSettings()">
                    Settings
                </button>
</div>
</div>
</main>
<footer class="mt-20 px-6 opacity-30">
<div class="max-w-6xl mx-auto flex justify-between items-center py-8 border-t border-slate-700">
<p class="text-xs font-black uppercase">© 2026 Squish-Memory Dashboard</p>
<div class="flex gap-4">
<span class="material-symbols-outlined text-sm">database</span>
<span class="text-xs font-black uppercase italic">Local-First Engine v1.0</span>
</div>
</div>
</footer>
<script>
        async function loadData() {
            try {
                const response = await fetch('/api/context');
                const data = await response.json();

                if (data.status === 'ok') {
                    document.getElementById('memories-count').textContent = data.memories.length;
                    document.getElementById('observations-count').textContent = data.observations.length;
                    document.getElementById('total-count').textContent = data.totalCount;
                    updateStatus('ok');

                    renderMemories(data.memories);
                    renderObservations(data.observations);

                    // Hide error alert
                    const errorAlert = document.querySelector('.blob-alert');
                    if (errorAlert) errorAlert.style.display = 'none';
                } else {
                    throw new Error('API returned error status');
                }
            } catch (error) {
                console.error('Failed to load data:', error);
                updateStatus('error');

                // Show error alert
                const errorAlert = document.querySelector('.blob-alert');
                if (errorAlert) errorAlert.style.display = 'flex';
            }
        }

        function renderMemories(memories) {
            const container = document.getElementById('memories');
            if (memories.length === 0) {
                container.innerHTML = '<div class="bg-card-bg/50 p-6 rounded-3xl border-2 border-slate-700/20 flex flex-col items-center justify-center py-16 opacity-60"><p class="font-black italic text-text-muted">No memories found</p></div>';
                return;
            }

            container.innerHTML = memories.map(function(memory) {
                return '<div class="bg-card-bg p-6 rounded-3xl border-2 border-slate-700/20 squishy-hover">' +
                    '<div class="flex items-start justify-between mb-4">' +
                        '<span class="bg-primary text-black px-3 py-1 rounded-full text-xs font-bold uppercase">' + memory.type + '</span>' +
                        '<span class="text-text-muted text-sm">' + formatTime(memory.createdAt) + '</span>' +
                    '</div>' +
                    '<div class="text-text-main mb-4">' + escapeHtml(memory.content) + '</div>' +
                    '<div class="text-text-muted text-sm">' +
                        'Tags: ' + (memory.tags ? memory.tags.join(', ') : 'none') + ' | ' +
                        'Project: ' + (memory.projectId || 'unknown') +
                    '</div>' +
                '</div>';
            }).join('');
        }

        function renderObservations(observations) {
            const container = document.getElementById('observations');
            if (observations.length === 0) {
                container.innerHTML = '<div class="bg-card-bg/50 p-6 rounded-3xl border-2 border-slate-700/20 flex flex-col items-center justify-center py-16 opacity-60"><p class="font-black italic text-text-muted">No observations found</p></div>';
                return;
            }

            container.innerHTML = observations.map(function(obs) {
                return '<div class="bg-card-bg p-6 rounded-3xl border-2 border-slate-700/20 squishy-hover">' +
                    '<div class="flex items-start justify-between mb-4">' +
                        '<span class="bg-secondary text-black px-3 py-1 rounded-full text-xs font-bold uppercase">' + obs.type + '</span>' +
                        '<span class="text-text-muted text-sm">' + formatTime(obs.createdAt) + '</span>' +
                    '</div>' +
                    '<div class="text-text-main mb-4">' + escapeHtml(obs.summary) + '</div>' +
                    '<div class="text-text-muted text-sm">' +
                        'Action: ' + obs.action + ' | ' +
                        'Target: ' + (obs.target || 'none') +
                    '</div>' +
                '</div>';
            }).join('');
        }

        function updateStatus(status) {
            const statusCard = document.querySelector('.squishy-hover.flex-col');
            if (!statusCard) return;

            if (status === 'ok') {
                statusCard.innerHTML = '<div class="flex items-center gap-3">' +
                    '<div class="size-4 bg-primary rounded-full animate-pulse"></div>' +
                    '<p class="text-2xl font-black text-primary italic">OK</p>' +
                    '</div>' +
                    '<p class="text-sm font-bold uppercase tracking-widest text-text-muted italic mt-1">Status</p>';
            } else {
                statusCard.innerHTML = '<div class="flex items-center gap-3">' +
                    '<div class="size-4 bg-red-500 rounded-full pulse-red"></div>' +
                    '<p class="text-2xl font-black text-red-400 italic">Error</p>' +
                    '</div>' +
                    '<p class="text-sm font-bold uppercase tracking-widest text-text-muted italic mt-1">Status</p>';
            }
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

        function openDocs() {
            // Create and show documentation modal
            const modal = document.createElement('div');
            modal.className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-50';
            modal.innerHTML = '<div class="bg-card-bg p-8 rounded-3xl border-2 border-slate-700/50 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto">' +
                '<div class="flex justify-between items-center mb-6">' +
                    '<h2 class="text-2xl font-black text-primary italic">Documentation</h2>' +
                    '<button onclick="closeModal(this)" class="text-text-muted hover:text-text-main text-2xl">&times;</button>' +
                '</div>' +
                '<div class="space-y-4 text-text-main">' +
                    '<div class="bg-card-bg/50 p-4 rounded-xl border border-slate-700/30">' +
                        '<h3 class="font-bold text-primary mb-2">🧠 Memory System</h3>' +
                        '<p class="text-sm">The Squish Memory Plugin captures and stores conversations, tool usage, and project insights across sessions.</p>' +
                    '</div>' +
                    '<div class="bg-card-bg/50 p-4 rounded-xl border border-slate-700/30">' +
                        '<h3 class="font-bold text-primary mb-2">📊 API Endpoints</h3>' +
                        '<ul class="text-sm space-y-1">' +
                            '<li><code class="bg-slate-700/50 px-2 py-1 rounded">GET /api/health</code> - Service health status</li>' +
                            '<li><code class="bg-slate-700/50 px-2 py-1 rounded">GET /api/memories</code> - Recent memories</li>' +
                            '<li><code class="bg-slate-700/50 px-2 py-1 rounded">GET /api/observations</code> - Tool usage observations</li>' +
                            '<li><code class="bg-slate-700/50 px-2 py-1 rounded">GET /api/context</code> - Combined data</li>' +
                        '</ul>' +
                    '</div>' +
                    '<div class="bg-card-bg/50 p-4 rounded-xl border border-slate-700/30">' +
                        '<h3 class="font-bold text-primary mb-2">⚙️ Configuration</h3>' +
                        '<p class="text-sm">Configure via environment variables: <code class="bg-slate-700/50 px-2 py-1 rounded">SQUISH_WEB_PORT</code>, <code class="bg-slate-700/50 px-2 py-1 rounded">DATABASE_URL</code>, etc.</p>' +
                    '</div>' +
                    '<div class="bg-card-bg/50 p-4 rounded-xl border border-slate-700/30">' +
                        '<h3 class="font-bold text-primary mb-2">🚀 Getting Started</h3>' +
                        '<p class="text-sm">1. Install the plugin<br>2. Configure your database<br>3. Start the web UI<br>4. Access at http://localhost:37777</p>' +
                    '</div>' +
                '</div>' +
            '</div>';
            document.body.appendChild(modal);
        }

        function openSettings() {
            // Create and show settings modal
            const modal = document.createElement('div');
            modal.className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-50';
            modal.innerHTML = '<div class="bg-card-bg p-8 rounded-3xl border-2 border-slate-700/50 max-w-md w-full mx-4">' +
                '<div class="flex justify-between items-center mb-6">' +
                    '<h2 class="text-2xl font-black text-primary italic">Settings</h2>' +
                    '<button onclick="closeModal(this)" class="text-text-muted hover:text-text-main text-2xl">&times;</button>' +
                '</div>' +
                '<div class="space-y-4">' +
                    '<div class="bg-card-bg/50 p-4 rounded-xl border border-slate-700/30">' +
                        '<label class="block text-sm font-bold text-text-main mb-2">Refresh Interval</label>' +
                        '<select class="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-text-main" onchange="changeRefreshInterval(this.value)">' +
                            '<option value="10000">10 seconds</option>' +
                            '<option value="30000" selected>30 seconds</option>' +
                            '<option value="60000">1 minute</option>' +
                            '<option value="300000">5 minutes</option>' +
                        '</select>' +
                    '</div>' +
                    '<div class="bg-card-bg/50 p-4 rounded-xl border border-slate-700/30">' +
                        '<label class="block text-sm font-bold text-text-main mb-2">Theme</label>' +
                        '<select class="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-text-main" onchange="changeTheme(this.value)">' +
                            '<option value="dark" selected>Dark</option>' +
                            '<option value="light">Light</option>' +
                        '</select>' +
                    '</div>' +
                    '<div class="bg-card-bg/50 p-4 rounded-xl border border-slate-700/30">' +
                        '<label class="block text-sm font-bold text-text-main mb-2">Items per Page</label>' +
                        '<select class="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-text-main" onchange="changeItemsPerPage(this.value)">' +
                            '<option value="10">10</option>' +
                            '<option value="25" selected>25</option>' +
                            '<option value="50">50</option>' +
                            '<option value="100">100</option>' +
                        '</select>' +
                    '</div>' +
                    '<div class="flex justify-end space-x-3 mt-6">' +
                        '<button onclick="closeModal(this)" class="px-4 py-2 bg-slate-700/50 hover:bg-slate-600/50 rounded-lg text-text-main transition-colors">Cancel</button>' +
                        '<button onclick="saveSettings()" class="px-4 py-2 bg-primary text-black rounded-lg hover:bg-primary/80 transition-colors">Save</button>' +
                    '</div>' +
                '</div>' +
            '</div>';
            document.body.appendChild(modal);
        }

        function closeModal(button) {
            const modal = button.closest('.fixed');
            if (modal) {
                modal.remove();
            }
        }

        function changeRefreshInterval(interval) {
            clearInterval(window.refreshInterval);
            window.refreshInterval = setInterval(loadData, parseInt(interval));
        }

        function changeTheme(theme) {
            if (theme === 'light') {
                document.documentElement.classList.remove('dark');
            } else {
                document.documentElement.classList.add('dark');
            }
        }

        function changeItemsPerPage(count) {
            // This would require updating the API calls, for now just store in localStorage
            localStorage.setItem('itemsPerPage', count);
        }

        function saveSettings() {
            // Close the modal and show success message
            const modal = document.querySelector('.fixed');
            if (modal) {
                // Could show a toast notification here
                modal.remove();
            }
        }

        loadData();
        window.refreshInterval = setInterval(loadData, 30000);
    </script>
</body></html>`;
  res.send(html);
});

// Start server
export function startWebServer() {
  app.listen(PORT, () => {
    console.log('[squish] Web UI available at http://localhost:' + PORT);
  });
}

export default app;