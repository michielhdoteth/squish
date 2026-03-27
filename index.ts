#!/usr/bin/env node

/**
 * Squish v1.0.2 - Universal Memory Plugin System
 * 
 * Modes:
 * - CLI Mode: For any MCP client bash execution (e.g., `squish remember "text"`)
 * - MCP Mode: For AI assistants (Claude Code, OpenClaw, OpenCode, Codex, etc.)
 *
 * Features:
 * - Hybrid Search: BM25 + vector search with RRF
 * - Importance Scoring: Auto-score memories with temporal decay
 * - Consolidation: Summarize old, low-importance memory clusters
 * - 16 MCP tools
 * - Local mode: SQLite with FTS5
 * - Team mode: PostgreSQL + pgvector
 * - Universal Plugin: Works with 7+ AI assistants
 */

import 'dotenv/config';
import fs from 'node:fs';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { Command } from 'commander';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { logger } from './core/logger.js';
import { checkDatabaseHealth, config, getDb } from './db/index.js';
import { getSchema } from './db/schema.js';
import { eq } from 'drizzle-orm';
import { checkRedisHealth, closeCache } from './core/cache.js';
import { rememberMemory, getMemoryById, searchMemories, getRecentMemories, updateConfidenceLevel } from './core/memory/memories.js';
import { toSqliteTags } from './core/memory/serialization.js';
import { searchConversations, getRecentConversations } from './core/search/conversations.js';
import { createObservation, getObservationsForProject } from './core/observations.js';
import { getProjectContext } from './core/context.js';
import { getMemoryStats } from './core/memory/stats.js';
import { ensureProject, getAllProjects } from './core/projects.js';
import { startWebServer } from './api/web/web.js';
import { handleDetectDuplicates } from './algorithms/handlers/detect-duplicates.js';
import { handleListProposals } from './algorithms/handlers/list-proposals.js';
import { handlePreviewMerge } from './algorithms/handlers/preview-merge.js';
import { handleApproveMerge } from './algorithms/handlers/approve-merge.js';
import { handleRejectMerge } from './algorithms/handlers/reject-merge.js';
import { handleReverseMerge } from './algorithms/handlers/reverse-merge.js';
import { handleGetMergeStats } from './algorithms/handlers/get-stats.js';
import { forceLifecycleMaintenance } from './core/worker.js';
import { summarizeSession } from './core/summarization.js';
import { storeAgentMemory } from './core/agent-memory.js';
import { getRelatedMemories, createAssociation } from './core/associations.js';
import { protectMemory, pinMemory, unpinMemory } from './core/governance.js';
import { isDatabaseUnavailableError, determineOverallStatus } from './core/utils.js';
import { searchWithQMD, isQMDAvailable } from './core/search/qmd-search.js';
import {
  initializeCoreMemory,
  getCoreMemory,
  editCoreMemorySection,
  appendCoreMemorySection,
  getCoreMemoryStats,
} from './core/core-memory.js';
import {
  loadMemoryToContext,
  evictMemoryFromContext,
  viewLoadedMemories,
  getContextStatus,
} from './core/context-paging.js';
import { ensureDataDirectory } from './db/bootstrap.js';
import { getDataDir } from './config.js';
import { performAutoLoad, shouldAutoLoad, getAutoLoadConfig } from './core/session/auto-load.js';
import { initializeScheduler, registerJobHandler } from './core/scheduler/cron-scheduler.js';
import { startHeartbeatChecking, heartbeat } from './core/scheduler/heartbeat.js';
import { runNightlyJob, runWeeklyJob } from './core/scheduler/job-runner.js';
import {
  DEFAULT_CONTEXT_CONFIG,
} from './core/context-window.js';

const VERSION = '1.0.3';

// ============================================================================
// Config Management (for project path persistence)
// ============================================================================

const USER_CONFIG_PATH = path.join(os.homedir(), '.squish', 'config.json');

function loadUserConfig(): any {
  try {
    if (fs.existsSync(USER_CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(USER_CONFIG_PATH, 'utf-8'));
    }
  } catch (e) {}
  return {};
}

function saveUserConfig(config: any): void {
  const dir = path.dirname(USER_CONFIG_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(USER_CONFIG_PATH, JSON.stringify(config, null, 2));
}

function getDefaultProjectPath(): string {
  const userConfig = loadUserConfig();
  if (userConfig.project) return userConfig.project;
  return process.cwd();
}

function resolveProjectPath(projectOption?: string): string {
  if (projectOption) return projectOption;
  return getDefaultProjectPath();
}

// ============================================================================
// Date parsing for time-based queries
// ============================================================================

function parseDate(input: string): Date | null {
  if (!input) return null;
  const now = new Date();
  const lower = input.toLowerCase().trim();
  
  // Direct date parse
  const parsed = new Date(input);
  if (!isNaN(parsed.getTime())) return parsed;
  
  // Relative parsing
  const dayMatch = lower.match(/(\d+)\s*day/i);
  const weekMatch = lower.match(/(\d+)\s*week/i);
  const monthMatch = lower.match(/(\d+)\s*month/i);
  
  if (lower === 'today') return now;
  if (lower === 'yesterday') return new Date(now.getTime() - 86400000);
  if (lower === 'thisweek' || lower === 'this week') {
    const d = new Date(now);
    d.setDate(d.getDate() - d.getDay());
    d.setHours(0, 0, 0, 0);
    return d;
  }
  if (lower === 'lastweek' || lower === 'last week') {
    const d = new Date(now);
    d.setDate(d.getDate() - d.getDay() - 7);
    return d;
  }
  
  if (dayMatch) return new Date(now.getTime() - parseInt(dayMatch[1]) * 86400000);
  if (weekMatch) return new Date(now.getTime() - parseInt(weekMatch[1]) * 604800000);
  if (monthMatch) return new Date(now.getTime() - parseInt(monthMatch[1]) * 2592000000);
  
  return null;
}

function filterByDateRange<T extends { createdAt?: string | null }>(items: T[], since?: string, until?: string): T[] {
  const sinceDate = parseDate(since || '');
  const untilDate = parseDate(until || '');
  
  return items.filter(item => {
    if (!item.createdAt) return true;
    const created = new Date(item.createdAt);
    if (sinceDate && created < sinceDate) return false;
    if (untilDate && created > untilDate) return false;
    return true;
  });
}

// Load plugin manifest for self-verification
function loadPluginManifest(): any {
  try {
    const manifestPath = path.join(getDefaultProjectPath(), 'config', 'plugin-manifest.json');
    if (fs.existsSync(manifestPath)) {
      return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    }
  } catch (error: any) {
    logger.warn('Could not load plugin manifest:', error?.message || error);
  }
  return null;
}

function verifyManifest(manifest: any): { ok: boolean; errors: string[] } {
  if (!manifest) {
    return { ok: false, errors: ['Manifest not found'] };
  }
  
  const errors: string[] = [];
  
  const required = ['id', 'name', 'version', 'capabilities', 'targets', 'dependencies'];
  required.forEach((field) => {
    if (!manifest[field]) {
      errors.push(`Missing required field: ${field}`);
    }
  });
  
  if (manifest.version !== VERSION) {
    errors.push(`Version mismatch: manifest=${manifest.version}, binary=${VERSION}`);
  }
  
  const expectedTargets = ['claude-code', 'openclaw', 'opencode', 'codex', 'cursor', 'vscode', 'windsurf'];
  expectedTargets.forEach((target) => {
    if (!manifest.targets[target]) {
      errors.push(`Missing target: ${target}`);
    }
  });
  
  return { ok: errors.length === 0, errors };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function showHelp() {
  console.log(`
Squish Memory v${VERSION} - Universal Memory Plugin System

Usage:
  squish                      Start interactive wizard
  squish run mcp              Start MCP server
  squish run web              Start Web UI only
  squish <command> [options]  Run CLI commands for agents

CLI Commands (for agents):
  squish remember <content>   Store a memory
  squish search <query>       Search memories
  squish health               Check system health
  squish stats                View statistics
  squish core_memory          Manage core memory

Examples:
  squish run mcp              # Start MCP server (for Claude Code)
  squish run web              # Start Web UI only
  squish remember "Hello"     # Store memory via CLI
  squish search "query"       # Search memories via CLI

For more info: https://github.com/michielhdoteth/squish
`);
}

async function runInteractiveInstaller() {
  const { select } = await import('@clack/prompts');
  const { isCancel } = await import('@clack/prompts');
  const { log } = await import('@clack/prompts');
  const { intro, outro } = await import('@clack/prompts');

  intro(`Squish Memory v${VERSION}`);

  const options = [
    { value: 'mcp', label: 'Start MCP Server (for AI Assistants: Claude Code, OpenCode, etc.)' },
    { value: 'web', label: 'Start Web UI Only' },
    { value: 'health', label: 'Health & Stats' },
    { value: 'help', label: 'Show Help' },
    { value: 'exit', label: 'Exit' }
  ];

  const selected = await select({
    message: 'What would you like to do?',
    options: options,
  });

  if (isCancel(selected)) {
    outro('Cancelled');
    process.exit(0);
    return;
  }

  switch (selected) {
    case 'mcp':
      log.step('Starting MCP server...');
      const { spawn } = await import('child_process');
      spawn('npx', ['squish-mcp'], { stdio: 'inherit', shell: true });
      break;
    case 'web':
      log.step('Starting Web UI...');
      await runWebOnly();
      break;
    case 'health':
      log.step('Checking health...');
      await runCliCommand('health');
      await runCliCommand('stats');
      break;
    case 'help':
      showHelp();
      process.exit(0);
      break;
    case 'exit':
      outro('Goodbye! 👋');
      process.exit(0);
      break;
  }
}

async function runCliCommand(command: string) {
  // Run CLI command programmatically
  const program = new Command();
  
  program.hook('preAction', async () => {
    await ensureDataDirectory();
  });
  
  if (command === 'health') {
    const dbHealth = await checkDatabaseHealth();
    const redisHealth = await checkRedisHealth();
    const dataDir = process.env.SQUISH_DATA_DIR || path.join(os.homedir(), '.squish');
    const dirExists = fs.existsSync(dataDir);
    
    console.log(`\n  Squish Memory v${VERSION}`);
    console.log(`  ====================`);
    console.log(`  Mode:     ${config.isTeamMode ? 'team' : 'local'}`);
    console.log(`  Database: ${dbHealth ? 'ok' : 'error'}`);
    console.log(`  Cache:    ${redisHealth ? 'ok' : 'unavailable'}`);
    console.log(`  Data Dir: ${dataDir}`);
    console.log(`  Status:   ${dbHealth ? 'HEALTHY' : 'UNHEALTHY'}\n`);
  } else if (command === 'stats') {
    const stats = await getMemoryStats(getDefaultProjectPath());
    console.log(JSON.stringify({ ok: true, ...stats }, null, 2));
  }
}

async function spawnInstallerWizard() {
  const distDir = path.dirname(fileURLToPath(import.meta.url));
  const packageDir = path.dirname(distDir);
  const installScript = path.join(packageDir, 'scripts', 'install-interactive.mjs');

  if (!fs.existsSync(installScript)) {
    console.error('Installer not found at:', installScript);
    process.exit(1);
  }

  console.log('\nLaunching full installer wizard...\n');
  const result = spawnSync('node', [`"${installScript}"`], {
    stdio: 'inherit',
    shell: true,
    cwd: packageDir
  });

  process.exit(result.status || 0);
}

function isDatabaseInitialized(): boolean {
  try {
    const dataDir = getDataDir();
    const dbPath = path.join(dataDir, 'squish.db');
    return existsSync(dataDir) && existsSync(dbPath);
  } catch (error) {
    return false;
  }
}

async function runWebOnly() {
  console.log(`[squish] Starting Web UI only...`);
  await ensureDataDirectory();
  startWebServer();
}

// ============================================================================
// CLI MODE DETECTION
// ============================================================================

const args = process.argv.slice(2);
const firstArg = args[0];

// Detect command type
const isNoArgs = args.length === 0;
const isRunCommand = firstArg === 'run';
const isHelpCommand = firstArg === '--help' || firstArg === '-h' || firstArg === 'help';

if (isNoArgs) {
  // Check if database exists - if not, run installer automatically
  if (!isDatabaseInitialized()) {
    console.log(`[squish] No existing database found. Launching installer wizard...\n`);
    await spawnInstallerWizard();
  } else {
    // === INTERACTIVE WIZARD (default when no args) ===
    runInteractiveInstaller().catch((e) => {
      console.error('Installer error:', e.message);
      process.exit(1);
    });
  }
} else if (isRunCommand) {
  // === RUN SUBCOMMAND ===
  const subcommand = args[1];
  if (subcommand === 'mcp') {
    const { spawn } = require('child_process');
    spawn('npx', ['squish-mcp'], { stdio: 'inherit', shell: true });
  } else if (subcommand === 'web') {
    runWebOnly().catch((e) => {
      logger.error('Web server error', e);
      process.exit(1);
    });
  } else {
    console.log(`
Usage: squish run <command>

Commands:
  mcp    Start MCP server
  web    Start Web UI only

Examples:
  squish run mcp   # Start MCP server with web UI
  squish run web   # Start Web UI only
`);
    process.exit(subcommand ? 1 : 0);
  }
} else if (isHelpCommand) {
  // === SHOW HELP ===
  showHelp();
  process.exit(0);
} else {
  // === CLI MODE (for agents/OpenClaw) ===
  runCliMode().catch((e) => {
    console.error(JSON.stringify({ error: e.message }, null, 2));
    process.exit(1);
  });
}

// ============================================================================
// CLI MODE (for OpenClaw bash execution)
// ============================================================================

async function runCliMode() {
  const program = new Command();

  program
    .name('squish')
    .description('Squish - Persistent memory for AI assistants')
    .version(VERSION);

  // Initialize data directory before any command
  program.hook('preAction', async () => {
    await ensureDataDirectory();
  });

  // squish config [get] [key] or squish config set <key> <value>
  program
    .command('config')
    .description('Manage Squish configuration')
    .argument('[action]', 'get, set, or list', 'list')
    .argument('[key]', 'Config key (e.g., project)')
    .argument('[value]', 'Config value (for set action)')
    .action(async (action, key, value) => {
      const userConfig = loadUserConfig();
      if (action === 'set') {
        if (!key || value === undefined) {
          console.log(JSON.stringify({ ok: false, error: 'Usage: squish config set <key> <value>' }, null, 2));
          process.exit(1);
        }
        userConfig[key] = value;
        saveUserConfig(userConfig);
        console.log(JSON.stringify({ ok: true, message: `Set ${key} = ${value}` }, null, 2));
      } else if (action === 'get') {
        if (!key) {
          console.log(JSON.stringify({ ok: false, error: 'Usage: squish config get <key>' }, null, 2));
          process.exit(1);
        }
        console.log(JSON.stringify({ ok: true, [key]: userConfig[key] || null }, null, 2));
      } else {
        console.log(JSON.stringify({ ok: true, config: userConfig }, null, 2));
      }
    });

  // squish remember "content" --type fact --tags tag1,tag2
  program
    .command('remember <content>')
    .description('Store a memory')
    .option('-t, --type <type>', 'Memory type (observation, fact, decision, context, preference)', 'observation')
    .option('-T, --tags <tags>', 'Comma-separated tags', '')
    .option('-p, --project <project>', 'Project path', getDefaultProjectPath())
    .action(async (content, options) => {
      try {
        const result = await rememberMemory({
          content,
          type: options.type,
          tags: options.tags ? options.tags.split(',').map((t: string) => t.trim()) : [],
          project: options.project,
        });
        console.log(JSON.stringify({ ok: true, ...result }, null, 2));
      } catch (error: any) {
        console.log(JSON.stringify({ ok: false, error: error.message }, null, 2));
        process.exit(1);
      }
    });

  // squish search "query" --type fact --limit 10 --since "3 days ago"
  program
    .command('search <query>')
    .description('Search memories')
    .option('-t, --type <type>', 'Filter by memory type')
    .option('-l, --limit <number>', 'Max results', '10')
    .option('-p, --project <project>', 'Project path', getDefaultProjectPath())
    .option('-s, --since <date>', 'Filter: created after this date (e.g., "3 days ago", "2026-01-01")')
    .option('-u, --until <date>', 'Filter: created before this date (e.g., "yesterday", "2026-01-15")')
    .action(async (query, options) => {
      try {
        const results = await searchMemories({
          query,
          type: options.type,
          limit: parseInt(options.limit, 10) * 2,
          project: options.project,
        });
        const filtered = filterByDateRange(results, options.since, options.until);
        const limited = filtered.slice(0, parseInt(options.limit, 10));
        console.log(JSON.stringify({ ok: true, query, count: limited.length, since: options.since, until: options.until, results: limited }, null, 2));
      } catch (error: any) {
        console.log(JSON.stringify({ ok: false, error: error.message }, null, 2));
        process.exit(1);
      }
    });

  // squish confidence <memoryId> [level] - Set or view confidence level
program
  .command('forget <memoryId>')
  .description('Delete a memory by ID')
  .action(async (memoryId) => {
    try {
      const db = await getDb();
      const schema = await getSchema();
      const sqliteDb = db as any;
      await sqliteDb.delete(schema.memories).where(eq(schema.memories.id, memoryId));
      console.log(JSON.stringify({ ok: true, message: `Memory ${memoryId} deleted` }, null, 2));
    } catch (error: any) {
      console.log(JSON.stringify({ ok: false, error: error.message }, null, 2));
      process.exit(1);
    }
  });

// squish associate <fromId> <toId> <type> - Link two memories
program
  .command('associate <fromMemoryId> <toMemoryId> <type>')
  .description('Link two memories together (relates_to, supports, contradicts, supersedes, duplicate)')
  .action(async (fromMemoryId, toMemoryId, type) => {
    try {
      await createAssociation(fromMemoryId, toMemoryId, type as any, 0.5);
      console.log(JSON.stringify({ ok: true, message: `Linked ${fromMemoryId} -> ${toMemoryId} (${type})` }, null, 2));
    } catch (error: any) {
      console.log(JSON.stringify({ ok: false, error: error.message }, null, 2));
      process.exit(1);
    }
  });

// squish related <memoryId> - Find related memories
program
  .command('related <memoryId>')
  .description('Find memories related to a memory via graph')
  .option('-d, --depth <number>', 'Graph depth (1-5)', '2')
  .option('-w, --min-weight <number>', 'Minimum weight (0-1)', '0.3')
  .action(async (memoryId, options) => {
    try {
      const related = await getRelatedMemories(memoryId, parseInt(options.depth) * 5);
      const filtered = related.filter((r: any) => r.weight >= parseFloat(options.minWeight));
      console.log(JSON.stringify({ ok: true, count: filtered.length, related: filtered }, null, 2));
    } catch (error: any) {
      console.log(JSON.stringify({ ok: false, error: error.message }, null, 2));
      process.exit(1);
    }
  });

// squish observe <type> <action> <summary> - Record observation
program
  .command('observe')
  .description('Record an observation (tool_use, file_change, error, pattern, insight)')
  .option('-t, --type <type>', 'Observation type', 'insight')
  .option('-a, --action <action>', 'Action performed')
  .option('-s, --summary <summary>', 'Summary')
  .option('--target <target>', 'Target file/resource')
  .option('-p, --project <project>', 'Project path', getDefaultProjectPath())
  .action(async (options) => {
    try {
      if (!options.action || !options.summary) {
        console.log(JSON.stringify({ ok: false, error: '--action and --summary required' }, null, 2));
        process.exit(1);
      }
      const observation = await createObservation({
        type: options.type as any,
        action: options.action,
        summary: options.summary,
        target: options.target,
        project: options.project,
      });
      console.log(JSON.stringify({ ok: true, observation }, null, 2));
    } catch (error: any) {
      console.log(JSON.stringify({ ok: false, error: error.message }, null, 2));
      process.exit(1);
    }
  });

// squish projects - List all projects
program
  .command('update <memoryId>')
  .description('Update a memory')
  .option('-c, --content <content>', 'New content')
  .option('-t, --type <type>', 'New type (observation, fact, decision, context, preference)')
  .option('-T, --tags <tags>', 'Comma-separated tags')
  .action(async (memoryId, options) => {
    try {
      const updates: Record<string, any> = {};
      if (options.content) updates.content = options.content;
      if (options.type) updates.type = options.type;
      if (options.tags) updates.tags = config.isTeamMode ? options.tags : JSON.stringify(options.tags.split(','));
      
      const db = await getDb();
      const schema = await getSchema();
      const sqliteDb = db as any;
      await sqliteDb.update(schema.memories).set(updates).where(eq(schema.memories.id, memoryId));
      console.log(JSON.stringify({ ok: true, message: `Memory ${memoryId} updated` }, null, 2));
    } catch (error: any) {
      console.log(JSON.stringify({ ok: false, error: error.message }, null, 2));
      process.exit(1);
    }
  });

// squish projects - List all projects
program
  .command('projects')
  .description('List all registered projects')
  .action(async () => {
    try {
      const allProjects = await getAllProjects();
      console.log(JSON.stringify({ ok: true, count: allProjects.length, projects: allProjects }, null, 2));
    } catch (error: any) {
      console.log(JSON.stringify({ ok: false, error: error.message }, null, 2));
      process.exit(1);
    }
  });

// squish recall <query or memoryId> - Search or get by ID
program
  .command('recall <query>')
  .description('Search memories by query or get by ID (if UUID provided)')
  .option('-l, --limit <number>', 'Max results', '5')
  .option('-t, --type <type>', 'Filter by memory type')
  .option('-p, --project <project>', 'Project path', getDefaultProjectPath())
  .option('-s, --since <date>', 'Filter: created after this date (e.g., "3 days ago", "yesterday")')
  .option('-u, --until <date>', 'Filter: created before this date (e.g., "today", "2026-01-15")')
  .action(async (query, options) => {
    try {
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(query);
      
      if (isUUID) {
        const memory = await getMemoryById(query);
        console.log(JSON.stringify({ ok: true, found: !!memory, memory }, null, 2));
      } else {
        const results = await searchMemories({
          query,
          type: options.type,
          limit: parseInt(options.limit, 10) * 2,
          project: options.project,
        });
        const filtered = filterByDateRange(results, options.since, options.until);
        const limited = filtered.slice(0, parseInt(options.limit, 10));
        const matches = limited.map((r: any) => ({
          id: r.id,
          score: r.similarity ?? 0,
          type: r.type,
          content: r.content.length > 200 ? r.content.slice(0, 200) + '...' : r.content,
          tags: r.tags,
        }));
        console.log(JSON.stringify({ ok: true, query, count: matches.length, since: options.since, until: options.until, matches }, null, 2));
      }
    } catch (error: any) {
      console.log(JSON.stringify({ ok: false, error: error.message }, null, 2));
      process.exit(1);
    }
  });

// squish today - Show memories from today
program
  .command('today')
  .description('Show memories from today')
  .option('-l, --limit <number>', 'Max results', '10')
  .option('-p, --project <project>', 'Project path', getDefaultProjectPath())
  .action(async (options) => {
    try {
      const results = await getRecentMemories(options.project, 100);
      const filtered = filterByDateRange(results, 'today', 'now');
      const limited = filtered.slice(0, parseInt(options.limit, 10));
      console.log(JSON.stringify({ ok: true, period: 'today', count: limited.length, results: limited }, null, 2));
    } catch (error: any) {
      console.log(JSON.stringify({ ok: false, error: error.message }, null, 2));
      process.exit(1);
    }
  });

// squish yesterday - Show memories from yesterday
program
  .command('yesterday')
  .description('Show memories from yesterday')
  .option('-l, --limit <number>', 'Max results', '10')
  .option('-p, --project <project>', 'Project path', getDefaultProjectPath())
  .action(async (options) => {
    try {
      const results = await getRecentMemories(options.project, 100);
      const filtered = filterByDateRange(results, 'yesterday', 'today');
      const limited = filtered.slice(0, parseInt(options.limit, 10));
      console.log(JSON.stringify({ ok: true, period: 'yesterday', count: limited.length, results: limited }, null, 2));
    } catch (error: any) {
      console.log(JSON.stringify({ ok: false, error: error.message }, null, 2));
      process.exit(1);
    }
  });

// squish thisweek - Show memories from this week
program
  .command('thisweek')
  .description('Show memories from this week')
  .option('-l, --limit <number>', 'Max results', '10')
  .option('-p, --project <project>', 'Project path', getDefaultProjectPath())
  .action(async (options) => {
    try {
      const results = await getRecentMemories(options.project, 100);
      const filtered = filterByDateRange(results, 'thisweek', 'now');
      const limited = filtered.slice(0, parseInt(options.limit, 10));
      console.log(JSON.stringify({ ok: true, period: 'thisweek', count: limited.length, results: limited }, null, 2));
    } catch (error: any) {
      console.log(JSON.stringify({ ok: false, error: error.message }, null, 2));
      process.exit(1);
    }
  });

// squish confidence <memoryId> [level] - Set or view confidence level
program
  .command('confidence <memoryId> [level]')
  .description('Set or view confidence level (certain/speculative/outdated)')
  .action(async (memoryId, level) => {
    try {
      if (!level) {
        const memory = await getMemoryById(String(memoryId));
        if (!memory) {
          console.log(JSON.stringify({ ok: false, error: 'Memory not found' }, null, 2));
          process.exit(1);
        }
        console.log(JSON.stringify({ ok: true, memoryId, confidenceLevel: memory.confidenceLevel ?? 'certain' }, null, 2));
      } else {
        const validLevels = ['certain', 'speculative', 'outdated'] as const;
        if (!validLevels.includes(level as any)) {
          console.log(JSON.stringify({ ok: false, error: 'Invalid level. Use: certain, speculative, or outdated' }, null, 2));
          process.exit(1);
        }
        await updateConfidenceLevel(String(memoryId), level as 'certain' | 'speculative' | 'outdated');
        console.log(JSON.stringify({ ok: true, memoryId, confidenceLevel: level }, null, 2));
      }
    } catch (error: any) {
      console.log(JSON.stringify({ ok: false, error: error.message }, null, 2));
      process.exit(1);
    }
  });

  // squish pin <memoryId> [--unpin]
  program
    .command('pin <memoryId>')
    .description('Pin/unpin a memory to prevent pruning/consolidation')
    .option('-u, --unpin', 'Unpin the memory instead of pinning', false)
    .action(async (memoryId, options) => {
      try {
        if (options.unpin) {
          await unpinMemory(String(memoryId));
          console.log(JSON.stringify({ ok: true, memoryId, pinned: false }, null, 2));
        } else {
          await pinMemory(String(memoryId));
          console.log(JSON.stringify({ ok: true, memoryId, pinned: true }, null, 2));
        }
      } catch (error: any) {
        console.log(JSON.stringify({ ok: false, error: error.message }, null, 2));
        process.exit(1);
      }
    });

  // squish tag add <tag> --search <query> --confirm
  // squish tag remove <tag> --older-than "30 days" --confirm
  program
    .command('tag')
    .description('Manage tags on memories (bulk)')
    .argument('<action>', 'add or remove')
    .argument('<tag>', 'Tag name')
    .option('-s, --search <query>', 'Search query to match memories')
    .option('-o, --older-than <date>', 'Only tag memories older than (e.g., "30 days")')
    .option('-t, --type <type>', 'Filter by memory type')
    .option('-c, --confirm', 'Actually execute the changes (default is dry-run)', false)
    .option('-l, --limit <number>', 'Max memories to process', '50')
    .option('-p, --project <project>', 'Project path', getDefaultProjectPath())
    .action(async (action, tag, options) => {
      try {
        if (!options.search && !options.olderThan) {
          console.log(JSON.stringify({ ok: false, error: 'Provide --search <query> or --older-than <date>' }, null, 2));
          process.exit(1);
        }
        
        const limit = parseInt(options.limit, 10);
        let results: any[];
        const searchInput: any = { query: options.search, limit, project: options.project };
        if (options.type) searchInput.type = options.type;
        
        if (options.search) {
          results = await searchMemories(searchInput);
        } else {
          results = await getRecentMemories(options.project, limit * 2);
        }
        
        let filtered = results;
        if (options.olderThan) {
          filtered = filterByDateRange(results, '', options.olderThan);
        }
        
        const db = await getDb();
        const schema = await getSchema();
        
        if (action === 'add') {
          const updated = [];
          for (const mem of filtered) {
            try {
              const tags = new Set((mem.tags || []) as string[]);
              if (!tags.has(tag)) {
                tags.add(tag);
                await (db as any).update(schema.memories)
                  .set({ tags: toSqliteTags(Array.from(tags)), updatedAt: new Date() })
                  .where(eq(schema.memories.id, mem.id));
                updated.push(mem.id);
              }
            } catch (e: any) {
              console.error('DEBUG: error updating', mem.id, e.message);
              throw e;
            }
          }
          console.log(JSON.stringify({ ok: true, action: 'add', tag, matched: filtered.length, updated: updated.length, dryRun: !options.confirm }, null, 2));
        } else if (action === 'remove') {
          const updated = [];
          for (const mem of filtered) {
            const tags = new Set((mem.tags || []) as string[]);
            if (tags.has(tag)) {
              tags.delete(tag);
              await (db as any).update(schema.memories)
                .set({ tags: toSqliteTags(Array.from(tags)), updatedAt: new Date() })
                .where(eq(schema.memories.id, mem.id));
              updated.push(mem.id);
            }
          }
          console.log(JSON.stringify({ ok: true, action: 'remove', tag, matched: filtered.length, updated: updated.length, dryRun: !options.confirm }, null, 2));
        } else {
          console.log(JSON.stringify({ ok: false, error: 'Use: squish tag add <tag> or squish tag remove <tag>' }, null, 2));
          process.exit(1);
        }
      } catch (error: any) {
        console.log(JSON.stringify({ ok: false, error: error.message }, null, 2));
        process.exit(1);
      }
    });

  // squish delete --older-than "30 days" --type observation --confirm
  program
    .command('delete')
    .description('Bulk delete memories by age and type')
    .option('-o, --older-than <date>', 'Delete memories older than (e.g., "30 days", "6 months")')
    .option('-t, --type <type>', 'Filter by memory type')
    .option('-s, --search <query>', 'Search query to match specific memories')
    .option('-c, --confirm', 'Actually delete (default is dry-run)', false)
    .option('-l, --limit <number>', 'Max memories to delete', '100')
    .option('-p, --project <project>', 'Project path', getDefaultProjectPath())
    .action(async (options) => {
      try {
        if (!options.olderThan && !options.search) {
          console.log(JSON.stringify({ ok: false, error: 'Provide --older-than <date> or --search <query>' }, null, 2));
          process.exit(1);
        }
        
        const query = options.search || '';
        const limit = parseInt(options.limit, 10);
        const results = await searchMemories({ query, type: options.type, limit, project: options.project });
        
        let filtered = results;
        if (options.olderThan) {
          filtered = filterByDateRange(results, '', options.olderThan);
        }
        
        const db = await getDb();
        const schema = await getSchema();
        
        const deleted = [];
        for (const mem of filtered) {
          await (db as any).delete(schema.memories).where(eq(schema.memories.id, mem.id));
          deleted.push(mem.id);
        }
        
        console.log(JSON.stringify({ ok: true, matched: filtered.length, deleted: deleted.length, dryRun: !options.confirm }, null, 2));
      } catch (error: any) {
        console.log(JSON.stringify({ ok: false, error: error.message }, null, 2));
        process.exit(1);
      }
    });

  // squish stale --days 30 - Show old, low-confidence, unaccessed memories
  program
    .command('stale')
    .description('Show stale memories (old, low-confidence, or rarely accessed)')
    .option('-d, --days <number>', 'Show memories older than N days', '30')
    .option('-c, --confidence <level>', 'Max confidence level to show (outdated, speculative)', 'speculative')
    .option('-l, --limit <number>', 'Max results', '20')
    .option('-p, --project <project>', 'Project path', getDefaultProjectPath())
    .action(async (options) => {
      try {
        const days = parseInt(options.days, 10);
        const cutoffDate = new Date(Date.now() - days * 86400000);
        
        const results = await getRecentMemories(options.project, 100);
        
        const stale = results.filter((m: any) => {
          const created = m.createdAt ? new Date(m.createdAt) : null;
          const isOld = created && created < cutoffDate;
          const isLowConfidence = m.confidenceLevel === 'outdated' || m.confidenceLevel === 'speculative';
          const hasLowImportance = (m.importance || 50) < 40;
          
          return isOld || isLowConfidence || hasLowImportance;
        });
        
        const limited = stale.slice(0, parseInt(options.limit, 10));
        
        const summary = {
          totalStale: stale.length,
          old: stale.filter((m: any) => m.createdAt && new Date(m.createdAt) < cutoffDate).length,
          lowConfidence: stale.filter((m: any) => m.confidenceLevel === 'outdated' || m.confidenceLevel === 'speculative').length,
          lowImportance: stale.filter((m: any) => (m.importance || 50) < 40).length,
        };
        
        console.log(JSON.stringify({ ok: true, summary, memories: limited }, null, 2));
      } catch (error: any) {
        console.log(JSON.stringify({ ok: false, error: error.message }, null, 2));
        process.exit(1);
      }
    });

  // squish health
  program
    .command('health')
    .description('Check service health and configuration')
    .option('-j, --json', 'Output as JSON', false)
    .action(async (options) => {
      try {
        const dbHealth = await checkDatabaseHealth();
        const redisHealth = await checkRedisHealth();
        const dataDir = process.env.SQUISH_DATA_DIR || path.join(os.homedir(), '.squish');
        const dirExists = fs.existsSync(dataDir);

        const status = {
          version: VERSION,
          mode: config.isTeamMode ? 'team' : 'local',
          database: dbHealth ? 'ok' : 'error',
          cache: redisHealth ? 'ok' : 'unavailable',
          dataDirectory: dataDir,
          dataDirectoryExists: dirExists,
          timestamp: new Date().toISOString()
        };

        if (options.json) {
          console.log(JSON.stringify({ ok: true, ...status }, null, 2));
        } else {
          console.log(`\n  Squish Memory v${VERSION}`);
          console.log(`  ====================`);
          console.log(`  Mode:     ${status.mode}`);
          console.log(`  Database: ${status.database}`);
          console.log(`  Cache:    ${status.cache}`);
          console.log(`  Data Dir: ${status.dataDirectory}`);
          console.log(`  Status:   ${dbHealth ? 'HEALTHY' : 'UNHEALTHY'}\n`);
        }

        if (!dbHealth) {
          process.exit(1);
        }
      } catch (error: any) {
        console.log(JSON.stringify({ ok: false, error: error.message }, null, 2));
        process.exit(1);
      }
    });

    // squish stats
    program
      .command('stats')
      .description('View statistics')
      .option('-p, --project <project>', 'Project path', getDefaultProjectPath())
      .action(async (options) => {
        try {
          const stats = await getMemoryStats(options.project);
          console.log(JSON.stringify({ ok: true, ...stats }, null, 2));
        } catch (error: any) {
          console.log(JSON.stringify({ ok: false, error: error.message }, null, 2));
          process.exit(1);
        }
      });

  // squish install
  program
    .command('install')
    .description('Run the interactive installer wizard')
    .action(async () => {
      await spawnInstallerWizard();
    });

// squish note "my thought here" - quick brain dump
program
.command('note <content>')
.description('Quick brain dump - store a raw memory to process later')
.option('-p, --project <project>', 'Project path', getDefaultProjectPath())
.action(async (content, options) => {
try {
const result = await rememberMemory({
content,
type: 'observation',
tags: ['note', 'quick'],
project: options.project,
});
console.log(JSON.stringify({ ok: true, message: 'Note saved', id: result.id }, null, 2));
} catch (error: any) {
console.log(JSON.stringify({ ok: false, error: error.message }, null, 2));
process.exit(1);
}
});

// squish context - Show project context (memories + observations)
program
.command('context')
.description('Show project context - recent memories and observations')
.option('-p, --project <project>', 'Project path', getDefaultProjectPath())
.option('-l, --limit <number>', 'Number of items to show', '10')
.option('-i, --include <items>', 'What to include: memories, observations, entities', 'memories,observations')
.option('-j, --json', 'Output as JSON', false)
.action(async (options) => {
try {
const include = options.include.split(',').map((i: string) => i.trim());
const limit = parseInt(options.limit, 10);
const context: any = await getProjectContext({ project: options.project, include, limit });
if (options.json) {
console.log(JSON.stringify({ ok: true, ...context }, null, 2));
} else {
console.log(`\n Project Context: ${context.project?.name || 'unknown'}`);
console.log(` ================================`);
if (context.memories?.length) {
console.log(`\n Recent Memories (${context.memories.length}):`);
for (const m of context.memories.slice(0, 5)) {
console.log(`   [${m.type}] ${m.content.substring(0, 60)}...`);
}
}
if (context.observations?.length) {
console.log(`\n Recent Observations (${context.observations.length}):`);
for (const o of context.observations.slice(0, 5)) {
console.log(`   ${o.content.substring(0, 60)}...`);
}
}
if (context.entities?.length) {
console.log(`\n Entities (${context.entities.length}):`);
for (const e of context.entities.slice(0, 5)) {
console.log(`   ${e.name} (${e.type})`);
}
}
console.log('');
}
} catch (error: any) {
console.log(JSON.stringify({ ok: false, error: error.message }, null, 2));
process.exit(1);
}
});

await program.parseAsync(process.argv);
}

// ============================================================================
// MCP server: commands/mcp-server.ts
// Run with: npx squish-mcp
// ============================================================================
