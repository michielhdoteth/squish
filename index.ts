#!/usr/bin/env node

/**
 * Squish - Universal Memory Plugin System
 * CLI + MCP server for persistent memory with hybrid search and encryption
 */

import 'dotenv/config';
import fs from 'node:fs';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
 import { spawn, spawnSync } from 'node:child_process';
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
import { checkRedisHealth, closeCache } from './core/storage/cache.js';
import { rememberMemory, getMemory, search, getRecent, setConfidence } from './core/memory/memories.js';
import { serializeTags } from './core/memory/serialization.js';
import { searchConversations, getRecentConversations } from './core/search/conversations.js';
import { createLearning, getLearnings, type LearningType } from './core/ingestion/learnings.js';
import { getProjectContext } from './core/context/context.js';
import { getMemoryStats } from './core/memory/stats.js';
import { ensureProject, getAllProjects } from './core/projects.js';
import { startWebServer } from './webui/server.js';
import { handleDetectDuplicates } from './core/algorithms/handlers/detect-duplicates.js';
import { handleListProposals } from './core/algorithms/handlers/list-proposals.js';
import { handlePreviewMerge } from './core/algorithms/handlers/preview-merge.js';
import { handleApproveMerge } from './core/algorithms/handlers/approve-merge.js';
import { handleRejectMerge } from './core/algorithms/handlers/reject-merge.js';
import { handleReverseMerge } from './core/algorithms/handlers/reverse-merge.js';
import { handleGetMergeStats } from './core/algorithms/handlers/get-stats.js';
import { forceLifecycleMaintenance } from './core/worker.js';
import { summarizeSession } from './core/summarization.js';
import { storeAgentMemory } from './core/ingestion/agent-memory.js';
import { getRelatedMemories, createAssociation } from './core/associations.js';
import { protectMemory, pinMemory, unpinMemory } from './core/security/governance.js';
 import { isDatabaseUnavailableError, determineOverallStatus } from './core/lib/utils.js';
 import { validateLimit } from './core/lib/validation.js';
import { runDeduplicationJob, runFullConsolidationJob } from './core/consolidation.js';
import { searchWithQMD, isQMDAvailable } from './core/search/qmd-search.js';
import {
  initializeCoreMemory,
  getCoreMemory,
  editCoreMemorySection,
  appendCoreMemorySection,
  getCoreMemoryStats,
} from './core/ingestion/core-memory.js';
import { getNamespaceTree } from './core/namespaces/index.js';
import {
  loadMemoryToContext,
  evictMemoryFromContext,
  viewLoadedMemories,
  getContextStatus,
} from './core/context/context-paging.js';
import { ensureDataDirectory } from './db/bootstrap.js';
import { getDataDir } from './config.js';
import { performAutoLoad, shouldAutoLoad, getAutoLoadConfig } from './core/session/auto-load.js';
import { initializeScheduler } from './core/scheduler/cron-scheduler.js';
import { runNightlyJob, runWeeklyJob } from './core/scheduler/job-runner.js';
import {
  DEFAULT_CONTEXT_CONFIG,
} from './core/context/context-window.js';
const VERSION = '1.1.0';

// Output Formatting Utilities
// ============================================================================

function formatOutput(data: any, pretty: boolean = false): string {
  if (!pretty) {
    return JSON.stringify(data, null, 2);
  }
  
  if (Array.isArray(data)) {
    return data.map((item, i) => `${i + 1}. ${formatItem(item)}`).join('\n');
  }
  
  if (data.results) {
    return data.results.map((item: any, i: number) => `${i + 1}. ${formatItem(item)}`).join('\n');
  }
  
  if (data.matches) {
    return data.matches.map((item: any, i: number) => `${i + 1}. ${formatItem(item)}`).join('\n');
  }
  
  if (data.count !== undefined) {
    let output = `\nFound ${data.count} results:\n`;
    if (data.results) {
      output += data.results.map((item: any, i: number) => `  ${i + 1}. ${formatItem(item)}`).join('\n');
    }
    return output;
  }
  
  return JSON.stringify(data, null, 2);
}

function formatItem(item: any): string {
  if (typeof item === 'string') return item.substring(0, 100);
  const content = item.content || item.summary || item.memory?.content || '';
  const type = item.type || '';
  return `[${type}] ${content.substring(0, 80)}${content.length > 80 ? '...' : ''}`;
}

function printSuccess(message: string): void {
  console.log(`\n  ✓ ${message}\n`);
}

function printError(message: string): void {
  console.error(`\n  ✗ ${message}\n`);
}

function printInfo(message: string): void {
  console.log(`\n  ℹ ${message}\n`);
}

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
  
  if (lower === 'today') {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    return d;
  }
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

async function buildHealthStatus() {
  const dbHealth = await checkDatabaseHealth();
  const redisHealth = await checkRedisHealth();
  const database = dbHealth ? 'ok' : 'error';
  const cache = config.redisEnabled ? (redisHealth ? 'ok' : 'error') : 'unavailable';
  const overallStatus = config.redisEnabled
    ? determineOverallStatus(database, redisHealth)
    : (dbHealth ? 'ok' : 'error');

  return {
    ok: overallStatus === 'ok',
    version: VERSION,
    mode: config.isTeamMode ? 'team' : 'local',
    database,
    cache,
    dataDirectory: config.dataDir,
    dataDirectoryExists: fs.existsSync(config.dataDir),
    status: overallStatus,
    timestamp: new Date().toISOString(),
  };
}

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
  squish config [action]      Manage Squish configuration
  squish remember <content>   Store a memory
  squish note <content>       Save a quick note
  squish learn <type> <text>  Record learning: success, failure, fix, insight
  squish search <query>       Search memories (--pretty for human output)
  squish recall <query>       Search or get by ID (--pretty for human output)
  squish recent --period      Recent memories (today/yesterday/thisweek/7days/30days)
  squish update <memoryId>    Update memory
  squish forget <memoryId>    Delete memory (single or bulk with --older-than --search)
  squish pin <memoryId>       Pin/unpin memory
  squish confidence <id>      Set confidence
  squish tag <action>         Manage tags
  squish stale                Show stale memories
  squish link <action>        Manage links (find/add/list)
  squish migrate              Migrate memories between .squish directories
  squish clean                Dedup + consolidate (maintenance)
  squish context              Show context or list projects
  squish stats                View memory statistics

Examples:
  squish run mcp              # Start MCP server (for agents)
  squish run web              # Start Web UI only
  squish config set project /repo/path
  squish remember "Hello"     # Store memory
  squish note "Ship v1 first" # Save a quick note
  squish learn observation "Updated auth flow" --action edit
  squish learn fix "Patched auth middleware" --target middleware.ts
  squish search "query"       # Search memories
  squish context --list-projects
  squish clean                # Run deduplication and consolidation

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
    const status = await buildHealthStatus();
    console.log(`\n  Squish Memory v${VERSION}`);
    console.log(`  ====================`);
    console.log(`  Mode:     ${status.mode}`);
    console.log(`  Database: ${status.database}`);
    console.log(`  Cache:    ${status.cache}`);
    console.log(`  Data Dir: ${status.dataDirectory}`);
    console.log(`  Status:   ${status.ok ? 'HEALTHY' : 'UNHEALTHY'}\n`);
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
  await startWebServer();
}

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
    // INTERACTIVE WIZARD (default when no args) ===
    runInteractiveInstaller().catch((e) => {
      console.error('Installer error:', e.message);
      process.exit(1);
    });
  }
  } else if (isRunCommand) {
    // RUN SUBCOMMAND ===
    const subcommand = args[1];
    if (subcommand === 'mcp') {
      (async () => {
        try {
          // Initialize data directory before starting MCP
          await ensureDataDirectory();
          
          // Start MCP server as child process (stdio mode for agents)
          const mcpProcess = spawn('npx', ['squish-mcp'], { 
            stdio: 'inherit', 
            shell: true 
          });
          
          // Forward MCP exit code when it exits
          mcpProcess.on('exit', (code: number | null) => {
            process.exit(code ?? 0);
          });
          
          // Clean shutdown: forward signals to MCP child
          const cleanup = () => {
            mcpProcess.kill('SIGTERM');
            setTimeout(() => process.exit(0), 100);
          };
          process.on('SIGINT', cleanup);
          process.on('SIGTERM', cleanup);
          
        } catch (error: any) {
          console.error('[squish] Failed to start MCP server:', error.message);
          process.exit(1);
        }
      })();
    } else if (subcommand === 'web') {
      runWebOnly().catch((e) => {
        logger.error('Web server error', e);
        process.exit(1);
      });
    } else {
      console.log(`
Usage: squish run <command>

Commands:
  mcp    Start MCP server (for agents like Claude Code)
  web    Start Web UI only

Examples:
  squish run mcp   # Start MCP server (agents connect automatically)
  squish run web   # Start Web UI at http://localhost:37777
`);
      process.exit(subcommand ? 1 : 0);
    }
  } else if (isHelpCommand) {
  // SHOW HELP ===
  showHelp();
  process.exit(0);
} else {
  // CLI MODE (for agents/OpenClaw) ===
  runCliMode().catch((e) => {
    console.error(JSON.stringify({ error: e.message }, null, 2));
    process.exit(1);
  });
}

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

  // squish mount /path/to/folder - Enable external memory
  program
    .command('mount')
    .description('Mount an external folder as memory storage')
    .argument('[path]', 'Path to external folder (or "status" or "unmount")')
    .action(async (pathOrAction) => {
      const { getExternalMemory } = await import('./core/external-folder/index.js');
      const externalMemory = getExternalMemory();
      
      if (pathOrAction === 'status') {
        // Show mount status
        const status = await externalMemory.getStatus();
        console.log(JSON.stringify({ ok: true, status }, null, 2));
      } else if (pathOrAction === 'unmount') {
        // Unmount
        externalMemory.unmount();
        console.log(JSON.stringify({ ok: true, message: 'External memory unmounted' }, null, 2));
      } else if (pathOrAction) {
        // Mount at path
        const result = await externalMemory.mount(pathOrAction);
        if (result.success) {
          console.log(JSON.stringify({ ok: true, message: `Mounted at ${pathOrAction}` }, null, 2));
        } else {
          console.log(JSON.stringify({ ok: false, error: result.error }, null, 2));
        }
      } else {
        console.log(JSON.stringify({ ok: false, error: 'Usage: squish mount <path> or squish mount status' }, null, 2));
      }
    });

  // squish remember "content" --type fact --tags tag1,tag2
  program
    .command('remember <content>')
    .description('Store a memory')
    .option('-t, --type <type>', 'Memory type (observation, fact, decision, context, preference)', 'observation')
    .option('-T, --tags <tags>', 'Comma-separated tags', '')
    .option('-p, --project <project>', 'Project path', getDefaultProjectPath())
    .option('-s, --source <source>', 'Source of this memory (e.g., "voice", "chat", "document")')
    .option('-r, --reasoning <reasoning>', 'Why this memory is important')
    .option('-c, --context <context>', 'What triggered this memory')
    .option('-e, --examples <examples>', 'When to apply this knowledge')
    .option('-x, --exceptions <exceptions>', 'When NOT to apply this')
    .option('-h, --wiki', 'Store as markdown file in .squish/wiki/raw/ (not in database)', false)
    .option('-H, --hot', 'Store in hot tier (active, high priority) in database', false)
    .option('-C, --cold', 'Store in cold tier (archived, lower priority) in database', false)
    .action(async (content, options) => {
      try {
        // Wiki file storage (not in database)
        if (options.wiki) {
          const { saveToWiki } = await import('./core/wiki/wiki-storage.js');
          const wikiMemory = await saveToWiki({
            content,
            type: options.type as any,
            tags: options.tags ? options.tags.split(',').map((t: string) => t.trim()) : [],
            project: options.project,
            source: options.source,
            reasoning: options.reasoning,
            memoryContext: options.context,
            examples: options.examples,
            exceptions: options.exceptions,
          });
          
          // Trigger hooks
          const { triggerMemoryCreated } = await import('./core/memory/hooks.js');
          await triggerMemoryCreated({
            memoryId: wikiMemory.id,
            content: wikiMemory.content,
            type: wikiMemory.type,
            tags: wikiMemory.tags,
            project: wikiMemory.project,
            source: wikiMemory.source,
            tier: 'hot',
          });
          
          console.log(JSON.stringify({ ok: true, wiki: true, ...wikiMemory }, null, 2));
          return;
        }
        
        // Database storage: determine tier
        const tier = options.cold ? 'cold' : 'hot';
        
        const result = await rememberMemory({
          content,
          type: options.type,
          tags: options.tags ? options.tags.split(',').map((t: string) => t.trim()) : [],
          project: options.project,
          source: options.source,
          reasoning: options.reasoning,
          memoryContext: options.context,
          examples: options.examples,
          exceptions: options.exceptions,
          tier,
        });
        
        // Trigger hooks for DB storage
        const { triggerMemoryCreated } = await import('./core/memory/hooks.js');
        await triggerMemoryCreated({
          memoryId: result.id,
          content: result.content,
          type: result.type,
          tags: result.tags,
          project: result.projectId || undefined,
          source: options.source || 'cli',
          tier,
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
    .option('-P, --pretty', 'Human-friendly output', false)
    .option('-w, --wiki', 'Search wiki files instead of database', false)
    .action(async (query, options) => {
      try {
        // Wiki file search
        if (options.wiki) {
          const { getWikiMemories } = await import('./core/wiki/wiki-storage.js');
          const wikiMemories = await getWikiMemories({
            type: options.type as any,
            project: options.project,
          });
          
          // Simple text search (can be enhanced with QMD later)
          const searchLower = query.toLowerCase();
          const filtered = wikiMemories.filter(m => 
            m.content.toLowerCase().includes(searchLower) ||
            m.tags.some(t => t.toLowerCase().includes(searchLower))
          ).slice(0, validateLimit(options.limit, 10, 1, 100));
          
          if (options.pretty) {
            console.log(`\n  Wiki Search: "${query}"`);
            console.log(`  Found ${filtered.length} results:\n`);
            filtered.forEach((r: any, i: number) => {
              console.log(`  ${i + 1}. [${r.type || 'memory'}] ${(r.content || '').substring(0, 60)}...`);
            });
            console.log('');
          } else {
            console.log(JSON.stringify({ ok: true, query, source: 'wiki', count: filtered.length, results: filtered }, null, 2));
          }
          return;
        }
        
        // Database search
        const results = await search({
          query,
          type: options.type,
          limit: validateLimit(options.limit, 10, 1, 100) * 2,
          project: options.project,
        });
        const filtered = filterByDateRange(results, options.since, options.until);
        const limited = filtered.slice(0, validateLimit(options.limit, 10, 1, 100));
        
        if (options.pretty) {
          console.log(`\n  Search: "${query}"`);
          console.log(`  Found ${limited.length} results:\n`);
          limited.forEach((r: any, i: number) => {
            console.log(`  ${i + 1}. [${r.type || 'memory'}] ${(r.content || '').substring(0, 60)}...`);
          });
          console.log('');
        } else {
          console.log(JSON.stringify({ ok: true, query, count: limited.length, since: options.since, until: options.until, results: limited }, null, 2));
        }
      } catch (error: any) {
        console.log(JSON.stringify({ ok: false, error: error.message }, null, 2));
        process.exit(1);
      }
    });

  // squish forget <memoryId> -- Delete single or bulk delete memories
program
  .command('forget [memoryId]')
  .description('Delete a memory by ID, or bulk delete with filters')
  .option('-o, --older-than <date>', 'Bulk delete memories older than (e.g., "30 days", "6 months")')
  .option('-t, --type <type>', 'Filter by memory type')
  .option('-s, --search <query>', 'Search query to match specific memories')
  .option('-c, --confirm', 'Actually delete (default is dry-run)', false)
  .option('-l, --limit <number>', 'Max memories to delete', '100')
  .option('-p, --project <project>', 'Project path', getDefaultProjectPath())
  .action(async (memoryId, options) => {
    try {
      // Single memory deletion
      if (memoryId) {
        const db = await getDb();
        const schema = await getSchema();
        const sqliteDb = db as any;
        await sqliteDb.delete(schema.memories).where(eq(schema.memories.id, memoryId));
        console.log(JSON.stringify({ ok: true, message: `Memory ${memoryId} deleted` }, null, 2));
        return;
      }
      
      // Bulk deletion
      if (!options.olderThan && !options.search) {
        console.log(JSON.stringify({ ok: false, error: 'Provide memory ID or use --older-than / --search for bulk delete' }, null, 2));
        process.exit(1);
      }
      
       const query = options.search || '';
       const limit = validateLimit(options.limit, 100, 1, 100);
       const results = await search({ query, type: options.type, limit, project: options.project });
      
      let filtered = results;
      if (options.olderThan) {
        filtered = filterByDateRange(results, '', options.olderThan);
      }
      
      const db = await getDb();
      const schema = await getSchema();
      const sqliteDb = db as any;
      
      const deleted = [];
      for (const mem of filtered) {
        await sqliteDb.delete(schema.memories).where(eq(schema.memories.id, mem.id));
        deleted.push(mem.id);
      }
      
      console.log(JSON.stringify({ ok: true, matched: filtered.length, deleted: deleted.length, dryRun: !options.confirm }, null, 2));
    } catch (error: any) {
      console.log(JSON.stringify({ ok: false, error: error.message }, null, 2));
      process.exit(1);
    }
  });

// squish link - Unified graph operations (find related, add links, list associations)
program
  .command('link')
  .description('Manage memory associations: find, add, list')
  .argument('<action>', 'Action: find, add, or list')
  .argument('[args...]', 'Additional arguments')
  .option('-p, --project <project>', 'Project path', getDefaultProjectPath())
  .action(async (action, args, options) => {
    try {
      // link find <memoryId> [--depth N] [--min-weight N]
      if (action === 'find') {
        const memoryId = args[0];
        if (!memoryId) {
          console.log(JSON.stringify({ ok: false, error: 'Usage: squish link find <memoryId> [--depth N] [--min-weight N]' }, null, 2));
          process.exit(1);
        }
         const depth = validateLimit(args[1], 2, 1, 5);
         const minWeight = parseFloat(args[2]) || 0.3;
        const related = await getRelatedMemories(memoryId, depth * 5);
        const filtered = related.filter((r: any) => r.weight >= minWeight);
        console.log(JSON.stringify({ ok: true, count: filtered.length, related: filtered }, null, 2));
        return;
      }
      
      // link add <fromId> <toId> <type>
      if (action === 'add') {
        const fromMemoryId = args[0];
        const toMemoryId = args[1];
        const type = args[2] || 'relates_to';
        if (!fromMemoryId || !toMemoryId) {
          console.log(JSON.stringify({ ok: false, error: 'Usage: squish link add <fromId> <toId> <type>' }, null, 2));
          process.exit(1);
        }
        await createAssociation(fromMemoryId, toMemoryId, type as any, 0.5);
        console.log(JSON.stringify({ ok: true, message: `Linked ${fromMemoryId} -> ${toMemoryId} (${type})` }, null, 2));
        return;
      }
      
      // link list - List all associations
      if (action === 'list') {
        const db = await getDb();
        const schema = await getSchema();
        const sqliteDb = db as any;
        const associations = await sqliteDb.select().from(schema.memoryAssociations).limit(100);
        console.log(JSON.stringify({ ok: true, count: associations.length, associations }, null, 2));
        return;
      }
      
      console.log(JSON.stringify({ ok: false, error: 'Usage: squish link <find|add|list> [args]' }, null, 2));
    } catch (error: any) {
      console.log(JSON.stringify({ ok: false, error: error.message }, null, 2));
      process.exit(1);
    }
  });

// squish learn <type> <content> - Record learning: success, failure, fix, or insight
program
  .command('learn <type> <content>')
  .description('Record learning: success, failure, fix, or insight')
  .option('-c, --context <context>', 'Additional context about what happened')
  .option('-a, --action <action>', 'Action performed')
  .option('-t, --target <target>', 'Target file or resource')
  .option('-m, --memory-id <memoryId>', 'Optional memory ID to link this learning to')
  .option('-p, --project <project>', 'Project path', getDefaultProjectPath())
  .action(async (type, content, options) => {
    try {
      const validTypes: LearningType[] = ['success', 'failure', 'fix', 'insight'];
      if (!validTypes.includes(type as LearningType)) {
        console.log(JSON.stringify({ ok: false, error: `Invalid type. Must be: ${validTypes.join(', ')}` }, null, 2));
        process.exit(1);
      }
      const learning = await createLearning({
        type: type as LearningType,
        content,
        context: options.context,
        action: options.action,
        target: options.target,
        project: options.project,
        memoryId: options.memoryId,
      });
      console.log(JSON.stringify({ ok: true, learning }, null, 2));
    } catch (error: any) {
      console.log(JSON.stringify({ ok: false, error: error.message }, null, 2));
      process.exit(1);
    }
  });

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
       if (options.tags) updates.tags = serializeTags(options.tags.split(','));
      
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

// squish recall <query or memoryId> - Search or get by ID
program
  .command('recall <query>')
  .description('Search memories by query or get by ID (if UUID provided)')
  .option('-l, --limit <number>', 'Max results', '5')
  .option('-t, --type <type>', 'Filter by memory type')
  .option('-p, --project <project>', 'Project path', getDefaultProjectPath())
  .option('-s, --since <date>', 'Filter: created after this date (e.g., "3 days ago", "yesterday")')
  .option('-u, --until <date>', 'Filter: created before this date (e.g., "today", "2026-01-15")')
  .option('-P, --pretty', 'Human-friendly output', false)
  .action(async (query, options) => {
    try {
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(query);
      
      if (isUUID) {
        const memory = await getMemory(query);
        if (options.pretty && memory) {
          console.log(`\n  Memory: ${memory.id}`);
          console.log(`  Type: ${memory.type}`);
          console.log(`  Content: ${memory.content}\n`);
        } else {
          console.log(JSON.stringify({ ok: true, found: !!memory, memory }, null, 2));
        }
       } else {
         const results = await search({
           query,
           type: options.type,
           limit: validateLimit(options.limit, 5, 1, 100) * 2,
           project: options.project,
         });
         const filtered = filterByDateRange(results, options.since, options.until);
         const limited = filtered.slice(0, validateLimit(options.limit, 5, 1, 100));
        
        if (options.pretty) {
          console.log(`\n  Recall: "${query}"`);
          console.log(`  Found ${limited.length} matches:\n`);
          limited.forEach((r: any, i: number) => {
            console.log(`  ${i + 1}. [${r.type || 'memory'}] ${(r.content || '').substring(0, 60)}... (${(r.similarity ?? 0).toFixed(2)})`);
          });
          console.log('');
        } else {
          const matches = limited.map((r: any) => ({
            id: r.id,
            score: r.similarity ?? 0,
            type: r.type,
            content: r.content.length > 200 ? r.content.slice(0, 200) + '...' : r.content,
            tags: r.tags,
          }));
          console.log(JSON.stringify({ ok: true, query, count: matches.length, since: options.since, until: options.until, matches }, null, 2));
        }
      }
    } catch (error: any) {
      console.log(JSON.stringify({ ok: false, error: error.message }, null, 2));
      process.exit(1);
    }
  });

// squish recent --period <period> - Show recent memories
program
  .command('recent')
  .description('Show recent memories by period')
  .option('-p, --period <period>', 'Period: today, yesterday, thisweek, 7days, 30days, or custom like "3 days"', 'today')
  .option('-s, --since <date>', 'Start date (alternative to --period)')
  .option('-u, --until <date>', 'End date (alternative to --period)')
  .option('-l, --limit <number>', 'Max results', '10')
  .option('-P, --project <project>', 'Project path', getDefaultProjectPath())
  .action(async (options) => {
    try {
      let since: string, until: string;
      
      if (options.since && options.until) {
        since = options.since;
        until = options.until;
      } else if (options.since) {
        since = options.since;
        until = 'now';
      } else {
        const periodMap: Record<string, [string, string]> = {
          today: ['today', 'now'],
          yesterday: ['yesterday', 'today'],
          thisweek: ['thisweek', 'now'],
          '7days': ['7 days', 'now'],
          '14days': ['14 days', 'now'],
          '30days': ['30 days', 'now'],
          '90days': ['90 days', 'now'],
        };
        const mapped = periodMap[options.period];
        if (mapped) {
          [since, until] = mapped;
        } else {
          since = options.period;
          until = 'now';
        }
      }
      
       const results = await getRecent(options.project, 100);
       const filtered = filterByDateRange(results, since, until);
       const limited = filtered.slice(0, validateLimit(options.limit, 10, 1, 100));
      console.log(JSON.stringify({ ok: true, period: options.period, since, until, count: limited.length, results: limited }, null, 2));
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
        const memory = await getMemory(String(memoryId));
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
        await setConfidence(String(memoryId), level as 'certain' | 'speculative' | 'outdated');
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
        
         const limit = validateLimit(options.limit, 50, 1, 100);
         let results: any[];
        const searchInput: any = { query: options.search, limit, project: options.project };
        if (options.type) searchInput.type = options.type;
        
        if (options.search) {
          results = await search(searchInput);
        } else {
          results = await getRecent(options.project, limit * 2);
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
                   .set({ tags: serializeTags(Array.from(tags)), updatedAt: new Date() })
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
                 .set({ tags: serializeTags(Array.from(tags)), updatedAt: new Date() })
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
         const days = validateLimit(options.days, 30, 1, 365);
         const cutoffDate = new Date(Date.now() - days * 86400000);
         
         // Get recent memories - larger limit to find stale ones
         const results = await getRecent(options.project, 500);
         
         const stale = results.filter((m: any) => {
           const created = m.createdAt ? new Date(m.createdAt) : null;
           const isOld = created && created < cutoffDate;
           const isLowConfidence = m.confidenceLevel === 'outdated' || m.confidenceLevel === 'speculative';
           const hasLowImportance = (m.importance || 50) < 40;
           
           return isOld || isLowConfidence || hasLowImportance;
         });
         
         const limited = stale.slice(0, validateLimit(options.limit, 20, 1, 100));
        
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

    // squish stats
    program
      .command('stats')
      .description('View statistics')
      .option('-p, --project <project>', 'Project path', getDefaultProjectPath())
      .option('-w, --wiki', 'Show wiki storage stats instead of database', false)
      .action(async (options) => {
        try {
          // Wiki stats
          if (options.wiki) {
            const { getWikiStats, isWikiStorageAvailable } = await import('./core/wiki/wiki-storage.js');
            const available = isWikiStorageAvailable();
            if (!available) {
              console.log(JSON.stringify({ ok: false, error: 'Wiki storage not available' }, null, 2));
              process.exit(1);
            }
            const stats = await getWikiStats();
            console.log(JSON.stringify({ ok: true, source: 'wiki', ...stats }, null, 2));
            return;
          }
          
          // Database stats
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
  .description('Show project context or list available projects')
  .option('-p, --project <project>', 'Project path', getDefaultProjectPath())
  .option('-l, --limit <number>', 'Number of items to show', '10')
  .option('-i, --include <items>', 'What to include: memories, observations, entities', 'memories,observations')
  .option('--list-projects', 'List registered projects instead of loading context', false)
  .option('-j, --json', 'Output as JSON', false)
  .action(async (options) => {
    try {
      if (options.listProjects) {
        const projects = await getAllProjects();
        if (options.json) {
          console.log(JSON.stringify({ ok: true, count: projects.length, projects }, null, 2));
        } else {
          console.log(`\n Registered Projects (${projects.length})`);
          console.log(` ================================`);
          for (const project of projects) {
            console.log(`\n ${project.name}`);
            console.log(`   Path: ${project.path}`);
            console.log(`   ID: ${project.id}`);
          }
          console.log('');
        }
      }
    } catch (error: any) {
      console.log(JSON.stringify({ ok: false, error: error.message }, null, 2));
      process.exit(1);
    }
  });

// squish migrate - Migrate memories between databases
program
  .command('migrate')
  .description('Migrate memories from one .squish directory to another')
  .option('-f, --from <path>', 'Source .squish directory (read from)', '')
  .option('-t, --to <path>', 'Target .squish directory (write to)', '')
  .option('--delete-source', 'Delete source after migration (use with caution)', false)
  .option('--dry-run', 'Preview migration without applying', false)
  .action(async (options) => {
    try {
      if (!options.from || !options.to) {
        console.log(JSON.stringify({ 
          ok: false, 
          error: 'Usage: squish migrate --from /path/to/old/.squish --to /path/to/new/.squish' 
        }, null, 2));
        process.exit(1);
      }

      const sourcePath = path.join(options.from, 'squish.db');
      const targetPath = path.join(options.to, 'squish.db');
      
      if (!existsSync(sourcePath)) {
        console.log(JSON.stringify({ ok: false, error: `Source database not found: ${sourcePath}` }, null, 2));
        process.exit(1);
      }
      
      if (!existsSync(targetPath)) {
        console.log(JSON.stringify({ ok: false, error: `Target database not found: ${targetPath}` }, null, 2));
        process.exit(1);
      }

      console.log(`Migrating memories from:\n  ${options.from}\nto:\n  ${options.to}\n`);

      // Import database modules dynamically
      const { migrateMemories } = await import('./core/memory/migrate.js');
      
      const result = await migrateMemories(options.from, options.to, {
        dryRun: options.dryRun,
        deleteSource: options.deleteSource
      });

      console.log(JSON.stringify({ ok: true, ...result }, null, 2));
    } catch (error: any) {
      console.log(JSON.stringify({ ok: false, error: error.message }, null, 2));
      process.exit(1);
    }
  });

// squish clean - Run deduplication and consolidation
program
  .command('clean')
  .description('Run maintenance: deduplication + consolidation')
  .option('-t, --threshold <number>', 'Similarity threshold for dedup (0-1)', '0.85')
  .option('-d, --min-age <days>', 'Minimum age for consolidation', '90')
  .option('-i, --max-importance <number>', 'Max importance to consolidate (0-100)', '30')
  .option('-c, --min-cluster <number>', 'Minimum cluster size', '3')
  .option('-p, --project <project>', 'Project path', getDefaultProjectPath())
  .option('--dry-run', 'Preview changes without applying', false)
  .action(async (options) => {
    try {
      console.log('Running maintenance: deduplication + consolidation...\n');
      
      // Step 1: Deduplication
      console.log('Step 1: Finding duplicate memories...');
      const dedupResult = await runDeduplicationJob(options.project);
      console.log(`  Found ${dedupResult.duplicatesFound} duplicates, merged ${dedupResult.mergedCount}`);
      
      // Step 2: Consolidation
      console.log('\nStep 2: Consolidating old memories...');
      const consolidateResult = await runFullConsolidationJob(options.project);
      console.log(`  Clustered ${consolidateResult.clustered}, merged ${consolidateResult.merged}, consolidated ${consolidateResult.consolidated}`);
      
      console.log(JSON.stringify({
        ok: true,
        dedup: {
          duplicatesFound: dedupResult.duplicatesFound,
          mergedCount: dedupResult.mergedCount,
          tokensRecovered: dedupResult.tokensRecovered
        },
        consolidate: {
          clustered: consolidateResult.clustered,
          merged: consolidateResult.merged,
          consolidated: consolidateResult.consolidated
        }
      }, null, 2));
    } catch (error: any) {
      console.log(JSON.stringify({ ok: false, error: error.message }, null, 2));
    }
  });

await program.parseAsync(process.argv);
}

// MCP server: core/commands/mcp-server.ts
// Run with: npx squish-mcp
// ============================================================================
