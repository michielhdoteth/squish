console.log('[squish] Starting web server...');
import express from 'express';
import type { Server } from 'node:http';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { logger } from '../core/logger.js';
import { getRecent } from '../core/memory/memories.js';
import { getObservations } from '../core/ingestion/learnings.js';
import { getAllProjects, requireProject } from '../core/projects.js';
import { checkDatabaseHealth, getDb } from '../db/index.js';
import { config } from '../config.js';
import { isDatabaseUnavailableError } from '../core/lib/utils.js';
import { validateLimit } from '../core/lib/validation.js';

const app = express();
const PORT = Number(process.env.SQUISH_WEB_PORT || 37777);
const VERSION = '1.2.0';

const allowedOrigins = process.env.SQUISH_CORS_ORIGINS?.split(',').map(s => s.trim()) || ['http://localhost:*', 'http://127.0.0.1:*'];
const appCors = cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.some(allowed => {
      if (allowed.endsWith(':*')) {
        const prefix = allowed.slice(0, -1);
        return origin.startsWith(prefix);
      }
      return origin === allowed;
    })) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  }
});

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(appCors);
app.use(limiter);
app.use(express.json());

// Health check endpoint
app.get('/api/health', async (req, res) => {
  let dbStatus = 'error';
  let projectInfo = null;
  let allProjects: any[] = [];
  let errorMessage: string | null = null;

  try {
    const healthy = await checkDatabaseHealth();
    dbStatus = healthy ? 'ok' : 'error';

    if (healthy) {
      allProjects = await getAllProjects();
      if (allProjects.length > 0) {
        projectInfo = { id: allProjects[0].id, name: allProjects[0].name, path: allProjects[0].path };
      }
    }
  } catch (error: any) {
    errorMessage = error.message;
    if (!isDatabaseUnavailableError(error)) {
      logger.error('Health check failed:', error.message);
    }
  }

  res.json({
    ok: dbStatus === 'ok',
    status: dbStatus,
    version: VERSION,
    database: dbStatus,
    cache: config.redisEnabled ? 'configured' : 'unavailable',
    dataDirectory: config.dataDir,
    project: projectInfo || { id: 'unknown', name: 'No Project', path: '' },
    projects: allProjects,
    error: errorMessage,
    timestamp: new Date().toISOString()
  });
});

// Get recent memories
app.get('/api/memories', async (req, res) => {
   try {
     const projectPath = req.query.projectPath as string || process.cwd();
     const limit = validateLimit(req.query.limit as string, 20, 1, 100);
     
     const project = await requireProject(projectPath);
    
       const memories = await getRecent(projectPath, limit);
      
      res.json({
        status: 'ok',
        data: memories,
        count: memories.length,
        project: { id: project.id, name: project.name, path: project.path }
      });
    } catch (error: any) {
      if (!isDatabaseUnavailableError(error)) {
        logger.error('Failed to get memories:', error.message);
      }
      res.status(isDatabaseUnavailableError(error) ? 503 : 500).json({ status: 'error', message: error.message });
    }
});

// Get observations for project
app.get('/api/observations', async (req, res) => {
  try {
    const projectPath = req.query.projectPath as string || process.cwd();
    const limit = validateLimit(req.query.limit as string, 20, 1, 100);
    
     const project = await requireProject(projectPath);
    
     const observations = await getObservations(projectPath, limit);
    
    res.json({
      status: 'ok',
      data: observations,
      count: observations.length,
      project: { id: project.id, name: project.name, path: project.path }
     });
  } catch (error: any) {
    if (!isDatabaseUnavailableError(error)) {
      logger.error('Failed to get observations:', error.message);
    }
    res.status(isDatabaseUnavailableError(error) ? 503 : 500).json({ status: 'error', message: error.message });
  }
});

// Get project context
app.get('/api/context', async (req, res) => {
  try {
    // Get all projects and use first one as default if no projectPath specified
    const allProjects = await getAllProjects();
    let projectPath = req.query.projectPath as string;
    
    // If no projectPath provided, use the first project from database
    if (!projectPath && allProjects.length > 0) {
      projectPath = allProjects[0].path;
    }
    
    if (!projectPath) {
      return res.json({ 
        status: 'ok', 
        project: { id: 'unknown', name: 'No Project', path: '' },
        projects: allProjects,
        memories: [], 
        observations: [], 
        totalCount: 0,
        message: 'No projects found in database'
      });
    }
    
     const project = await requireProject(projectPath);
    
     const memories = await getRecent(projectPath, 20);
    const observations = await getObservations(projectPath, 20);

     res.json({
       status: 'ok',
       project: { id: project.id, name: project.name, path: project.path },
       projects: allProjects,
       memories: memories,
       observations: observations,
       totalCount: memories.length + observations.length
     });
   } catch (error: any) {
     if (!isDatabaseUnavailableError(error)) {
       logger.error('Failed to get context:', error.message);
     }
     res.status(isDatabaseUnavailableError(error) ? 503 : 500).json({ status: 'error', message: error.message });
   }
});

// Get all projects
app.get('/api/projects', async (req, res) => {
  try {
    const projects = await getAllProjects();
    res.json({
      status: 'ok',
      data: projects,
      count: projects.length
     });
   } catch (error: any) {
     if (!isDatabaseUnavailableError(error)) {
       logger.error('Failed to get projects:', error.message);
     }
     res.status(isDatabaseUnavailableError(error) ? 503 : 500).json({ status: 'error', message: error.message });
   }
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
<select id="project-select" onchange="changeProject(this.value)" class="bg-card-bg px-4 py-2 rounded-full border-2 border-slate-700/50 text-text-main text-sm font-medium focus:outline-none focus:border-primary">
<option value="">Loading projects...</option>
</select>
<div class="bg-card-bg px-4 py-2 rounded-full border-2 border-slate-700/50 flex items-center gap-2">
<div class="size-2 rounded-full bg-primary animate-pulse" id="status-dot"></div>
<span class="text-xs font-bold uppercase tracking-widest text-text-muted" id="server-status">Server: Online</span>
</div>
<div class="bg-card-bg px-3 py-1 rounded-full text-xs font-medium text-text-muted" id="server-version">
v1.2.0
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
<button class="bg-primary text-black px-6 py-3 rounded-full font-black text-sm uppercase hover:scale-105 transition-transform flex items-center gap-2" onclick="manualRefresh()" title="Refresh now">
<span class="material-symbols-outlined text-sm">refresh</span>
                    Refresh
                </button>
<button class="bg-slate-700 text-text-main px-6 py-3 rounded-full font-black text-sm uppercase hover:bg-slate-600 transition-colors flex items-center gap-2" id="pause-btn" onclick="togglePause()">
<span class="material-symbols-outlined text-sm" id="pause-icon">pause</span>
                    <span id="pause-text">Pause</span>
                </button>
<button class="text-text-muted px-6 py-3 rounded-full font-black text-sm uppercase hover:bg-slate-700/50 transition-colors" onclick="openDocs()">
                    Docs
                </button>
<button class="text-text-muted px-6 py-3 rounded-full font-black text-sm uppercase hover:bg-slate-700/50 transition-colors" onclick="openSettings()">
                    Settings
                </button>
</div>
</div>
<div class="flex justify-center mt-4">
<span class="text-xs font-medium text-text-muted" id="uptime-display">Uptime: calculating...</span>
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
        let currentProjectPath = null;
        
        async function loadProjects() {
            try {
                const response = await fetch('/api/projects');
                const data = await response.json();
                
                if (data.status === 'ok' && data.data && data.data.length > 0) {
                    const select = document.getElementById('project-select');
                    if (select) {
                        select.innerHTML = data.data.map(function(p) {
                            return '<option value="' + escapeHtml(p.path) + '">' + escapeHtml(p.name || p.path) + '</option>';
                        }).join('');
                        
                        // Try to select current directory
                        const cwd = window.location.pathname === '/' ? '' : window.location.pathname;
                        const defaultProject = data.data.find(function(p) { return p.path === cwd; }) || data.data[0];
                        if (defaultProject) {
                            currentProjectPath = defaultProject.path;
                            select.value = defaultProject.path;
                        }
                    }
                } else {
                    // No projects yet, use current directory
                    currentProjectPath = window.location.pathname === '/' ? '' : window.location.pathname;
                }
            } catch (error) {
                console.error('Failed to load projects:', error);
                currentProjectPath = '';
            }
        }
        
        async function loadData() {
            try {
                const url = currentProjectPath ? '/api/context?projectPath=' + encodeURIComponent(currentProjectPath) : '/api/context';
                const response = await fetch(url);
                const data = await response.json();

                if (data.status === 'ok') {
                    document.getElementById('memories-count').textContent = data.memories ? data.memories.length : 0;
                    document.getElementById('observations-count').textContent = data.observations ? data.observations.length : 0;
                    document.getElementById('total-count').textContent = data.totalCount || 0;
                    updateStatus(data.memories && data.observations ? 'ok' : 'error');
                    
                    // Update server status based on health
                    updateServerStatus(true, data.version || '1.2.0', data.project?.name);

                    renderMemories(data.memories || []);
                    renderObservations(data.observations || []);

                    // Update project info
                    if (data.project) {
                        const projectInfo = document.getElementById('project-info');
                        if (projectInfo) {
                            projectInfo.textContent = data.project.name || data.project.path || 'Unknown';
                        }
                    }

                    // Hide error alert if data loaded
                    const errorAlert = document.querySelector('.blob-alert');
                    if (errorAlert && (data.memories && data.memories.length > 0 || data.observations && data.observations.length > 0)) {
                        errorAlert.style.display = 'none';
                    }
                    
                    // Show error alert if message present
                    if (data.message) {
                        const errorAlert = document.querySelector('.blob-alert');
                        if (errorAlert) {
                            errorAlert.querySelector('p').textContent = data.message;
                            errorAlert.style.display = 'flex';
                        }
                    }
                } else {
                    throw new Error('API returned error status');
                }
            } catch (error) {
                updateStatus('error');
                updateServerStatus(false);

                // Show error alert
                const errorAlert = document.querySelector('.blob-alert');
                if (errorAlert) errorAlert.style.display = 'flex';
            }
        }

        function renderMemories(memories) {
            const container = document.getElementById('memories');
            if (!memories || memories.length === 0) {
                container.innerHTML = '<div class="bg-card-bg/50 p-6 rounded-3xl border-2 border-slate-700/20 flex flex-col items-center justify-center py-16 opacity-60"><p class="font-black italic text-text-muted">No memories found</p></div>';
                return;
            }

            container.innerHTML = memories.map(function(memory) {
                return '<div class="bg-card-bg p-6 rounded-3xl border-2 border-slate-700/20 squishy-hover">' +
                    '<div class="flex items-start justify-between mb-4">' +
                        '<span class="bg-primary text-black px-3 py-1 rounded-full text-xs font-bold uppercase">' + (memory.type || 'memory') + '</span>' +
                        '<span class="text-text-muted text-sm">' + formatTime(memory.createdAt) + '</span>' +
                    '</div>' +
                    '<div class="text-text-main mb-4">' + escapeHtml(memory.content || memory.text || '') + '</div>' +
                    '<div class="text-text-muted text-sm">' +
                        'Tags: ' + (memory.tags ? memory.tags.join(', ') : 'none') +
                    '</div>' +
                '</div>';
            }).join('');
        }

        function renderObservations(observations) {
            const container = document.getElementById('observations');
            if (!observations || observations.length === 0) {
                container.innerHTML = '<div class="bg-card-bg/50 p-6 rounded-3xl border-2 border-slate-700/20 flex flex-col items-center justify-center py-16 opacity-60"><p class="font-black italic text-text-muted">No observations found</p></div>';
                return;
            }

            container.innerHTML = observations.map(function(obs) {
                return '<div class="bg-card-bg p-6 rounded-3xl border-2 border-slate-700/20 squishy-hover">' +
                    '<div class="flex items-start justify-between mb-4">' +
                        '<span class="bg-secondary text-black px-3 py-1 rounded-full text-xs font-bold uppercase">' + (obs.type || 'observation') + '</span>' +
                        '<span class="text-text-muted text-sm">' + formatTime(obs.createdAt) + '</span>' +
                    '</div>' +
                    '<div class="text-text-main mb-4">' + escapeHtml(obs.summary || obs.content || '') + '</div>' +
                    '<div class="text-text-muted text-sm">' +
                        'Action: ' + (obs.action || 'none') + ' | ' +
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
        
        // Manual refresh - reload data immediately
        function manualRefresh() {
            var btn = document.querySelector('[onclick="manualRefresh()"]');
            if (btn) {
                btn.classList.add('animate-spin');
            }
            loadData().then(function() {
                if (btn) {
                    btn.classList.remove('animate-spin');
                }
                updateUptime();
            });
        }

        // Pause/Resume auto-refresh
        var isPaused = false;
        function togglePause() {
            isPaused = !isPaused;
            var btn = document.getElementById('pause-btn');
            var icon = document.getElementById('pause-icon');
            var text = document.getElementById('pause-text');
            
            if (isPaused) {
                // Pause - clear interval and update button
                if (window.refreshInterval) {
                    clearInterval(window.refreshInterval);
                    window.refreshInterval = null;
                }
                if (btn) btn.classList.add('bg-orange-500/50', 'border', 'border-orange-500');
                if (icon) icon.textContent = 'play_arrow';
                if (text) text.textContent = 'Resume';
            } else {
                // Resume - restart interval
                window.refreshInterval = setInterval(loadData, 30000);
                if (btn) btn.classList.remove('bg-orange-500/50', 'border', 'border-orange-500');
                if (icon) icon.textContent = 'pause';
                if (text) text.textContent = 'Pause';
                loadData();
            }
        }

        // Update uptime display
        var serverStartTime = Date.now();
        function updateUptime() {
            var el = document.getElementById('uptime-display');
            if (!el) return;
            
            var elapsed = Math.floor((Date.now() - serverStartTime) / 1000);
            var hours = Math.floor(elapsed / 3600);
            var mins = Math.floor((elapsed % 3600) / 60);
            var secs = elapsed % 60;
            
            var timeStr = hours > 0 
                ? hours + 'h ' + mins + 'm ' + secs + 's'
                : mins > 0 
                    ? mins + 'm ' + secs + 's'
                    : secs + 's';
            
            el.textContent = 'Uptime: ' + timeStr;
        }
        
        function updateServerStatus(ok, version, projectName) {
            var dot = document.getElementById('status-dot');
            var status = document.getElementById('server-status');
            var ver = document.getElementById('server-version');
            
            if (ok) {
                if (dot) {
                    dot.classList.remove('bg-red-500', 'pulse-red');
                    dot.classList.add('bg-primary', 'animate-pulse');
                }
                if (status) status.textContent = 'Server: Online';
            } else {
                if (dot) {
                    dot.classList.remove('bg-primary', 'animate-pulse');
                    dot.classList.add('bg-red-500', 'pulse-red');
                }
                if (status) status.textContent = 'Server: Offline';
            }
            
            if (version && ver) {
                ver.textContent = 'v' + version;
            }
        }

        function changeProject(path) {
            currentProjectPath = path;
            loadData();
        }

        // Initialize: load projects first, then data
        loadProjects().then(function() {
            loadData();
            // Start uptime counter
            serverStartTime = Date.now();
            setInterval(updateUptime, 1000);
            
            // Default not paused
            isPaused = false;
            window.refreshInterval = setInterval(function() {
                if (!isPaused) loadData();
            }, 30000);
        });
    </script>
</body></html>`;
  res.send(html);
});

// Start server
export function startWebServer(): Promise<Server> {
  return new Promise((resolve, reject) => {
    const server = app.listen(PORT, () => {
      console.log(`[squish] Web UI available at http://localhost:${PORT}`);
      resolve(server);
    });

    server.on('error', (err) => {
      console.error('[squish] Server error:', err.message);
      reject(err);
    });
  });
}

// Start server immediately when run directly
startWebServer()
  .then(() => {
    console.log('[squish] Server started successfully');
  })
  .catch((err) => {
    console.error('[squish] Failed to start server:', err.message);
    process.exit(1);
  });

export default app;
