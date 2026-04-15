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
import { ensureProject, getAllProjects, getOrCreateProject } from './core/projects.js';
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
 import { isDatabaseUnavailableError, determineOverallStatus, parseDate, filterByDateRange } from './core/lib/utils.js';
 import { validateLimit } from './core/lib/validation.js';
 import { runDeduplicationJob, runFullConsolidationJob } from './core/consolidation.js';
import {
  initializeCoreMemory,
  getCoreMemory,
  editCoreMemorySection,
  appendCoreMemorySection,
  getCoreMemoryStats,
} from './core/ingestion/core-memory.js';
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
import {
  handleSessionStart,
  handlePostToolUse,
  handleSessionEnd,
  handlePreCompact,
} from './core/hooks/agent-hooks.js';
import {
  initializeDefaultPlaces,
  getProjectPlaces,
  walkPlace,
  walkAllPlaces,
  quickTour,
  getFullWalkingContext,
  type PlaceType,
} from './core/places/index.js';
const VERSION = '1.1.6';

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
  squish remember <content>   Store a memory (auto-detects type)
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
  squish context              Show context or list projects
  squish stats                View memory statistics
  squish mount [path]         Mount external folder as memory storage

Note: Deduplication and consolidation run automatically via cron scheduler.

Examples:
  squish run mcp              # Start MCP server (for agents)
  squish run web              # Start Web UI only
  squish remember "Hello"     # Store memory (auto-detects type)
  squish search "query"        # Search memories
  squish context --list-projects

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

  // config command removed - use environment variables instead

  // squish remember "content" - UNIFIED MEMORY WRITE
  // Single smart write path: auto-detects intent and routes to memory or learning
  program
    .command('remember <content>')
    .description('Store any memory or learning. System auto-detects type and routes appropriately. This is THE memory write command for agents - handles hot/cold tiers and all memory types.')
    .option('-p, --project <project>', 'Project path', getDefaultProjectPath())
    .option('-T, --tags <tags>', 'Comma-separated tags', '')
    .option('-t, --tier <tier>', 'Memory tier: hot (active) or cold (archived)', 'hot')
    .option('-y, --type <type>', 'Memory type: observation, fact, decision, context, preference, note (auto-detected if not provided)')
    .option('-l, --learning-type <type>', 'Learning type when routing to learning storage: success, failure, fix, insight')
    .option('-c, --confidence <level>', 'Confidence level 0-100 (default: auto-calculated)')
    .option('-s, --source <source>', 'Source: cli, voice, chat, document (default: cli)')
    .option('-o, --route <route>', 'Force routing: auto, memory, learning, note', 'auto')
    .option('-P, --pin', 'Pin memory to prevent pruning/consolidation', false)
    .option('-u, --unpin', 'Unpin memory', false)
    .action(async (content, options) => {
      try {
        const { detectMemorySignals } = await import('./core/memory/trigger-detector.js');
        const signals = detectMemorySignals(content);

        let routing: "memory" | "learning" | "note" = "memory";
        let inferredType = options.type || signals.suggestedType;
        let routingReason = "";

        // Check for learning patterns if auto mode
        if (options.route === "auto") {
          const hasLessonPattern = /(\bfailed\s+because\b|\blesson\s+learned\b|\bnext\s+time\b|\broot\s+cause\b|\bsuccess\b.*\bbecause\b|\bi\s+learned\b|\binsight\b)/i.test(content);
          const hasLearningType = /(\bsuccess\b|\bfailure\b|\bfix\b|\binsight\b)/i.test(content);
          
          // New: Enhanced learning detection from rationale patterns
          const hasHackPattern = /(\bHACK\b|\bworkaround\b|\btemporary\s+fix\b)/i.test(content);
          const hasFixmePattern = /(\bFIXME\b|\bXXX\b|\bbug\b.*\bfix\b)/i.test(content);
          
          if (hasLessonPattern || hasLearningType || hasHackPattern || hasFixmePattern) {
            routing = "learning";
            if (hasHackPattern || hasFixmePattern) {
              routingReason = "Detected code pattern (HACK/FIXME)";
            } else {
              routingReason = "Detected learning pattern in content";
            }
          } else if (signals.suggestedType === 'task') {
            routing = "memory";
            routingReason = "Detected TODO pattern";
          } else if (signals.suggestedType === 'observation' && /\b(note|note\s+that|log|remember)\b/i.test(content)) {
            routing = "note";
            routingReason = "Detected note pattern";
          } else {
            routing = "memory";
            routingReason = `Detected as ${inferredType}`;
          }
        } else if (options.route === "learning") {
          routing = "learning";
          routingReason = "Override: forced to learning";
        } else if (options.route === "note") {
          routing = "note";
          routingReason = "Override: forced to note";
        } else {
          routing = "memory";
          routingReason = "Override: forced to memory";
        }

        let result: any;
        const tags = options.tags ? options.tags.split(',').map((t: string) => t.trim()) : [];
        const tier = options.tier === "cold" ? "cold" : "hot";

        if (routing === "learning") {
          // Determine learning type from content or override
          let learningType: "success" | "failure" | "fix" | "insight" = "insight";
          if (options.learningType) {
            learningType = options.learningType as any;
          } else {
            if (/(\bsuccess\b|\bworked\b|\bfinished\b)/i.test(content)) learningType = "success";
            else if (/(\bfailed\b|\berror\b|\bbroke\b)/i.test(content)) learningType = "failure";
            else if (/(\bfix\b|\b workaround\b|\bsolved\b)/i.test(content)) learningType = "fix";
          }

          const { createLearning } = await import('./core/ingestion/learnings.js');
          const learning = await createLearning({ 
            type: learningType, 
            content, 
            project: options.project,
            autoLink: true 
          });
          result = { id: learning.id, type: "learning", learningType, content };
        } else {
          // Store as memory with all options
          const memory = await rememberMemory({ 
            content, 
            type: inferredType as any, 
            tags, 
            project: options.project,
            tier,
            source: options.source || 'cli'
          });
          
          // Handle pin/unpin after creation
          if (options.pin) {
            const { pinMemory } = await import('./core/security/governance.js');
            await pinMemory(memory.id);
          } else if (options.unpin) {
            const { unpinMemory } = await import('./core/security/governance.js');
            await unpinMemory(memory.id);
          }
          
          result = { id: memory.id, type: "memory", memoryType: inferredType, tier, content, pinned: options.pin };
        }

        console.log(JSON.stringify({ 
          ok: true, 
          id: result.id,
          routing,
          type: routing === "learning" ? result.learningType : result.memoryType,
          tier: routing === "memory" ? tier : 'N/A',
          priority: signals.priority,
          confidence: signals.confidence,
          pinned: (result as any).pinned,
          reason: routingReason
        }, null, 2));
      } catch (error: any) {
        console.log(JSON.stringify({ ok: false, error: error.message }, null, 2));
        process.exit(1);
      }
    });

  // squish search "query" --type fact --limit 10 --since "3 days ago" --place wip
  program
    .command('search <query>')
    .description('Search memories')
    .option('-t, --type <type>', 'Filter by memory type')
    .option('-l, --limit <number>', 'Max results', '10')
    .option('-p, --project <project>', 'Project path', getDefaultProjectPath())
    .option('-s, --since <date>', 'Filter: created after this date (e.g., "3 days ago", "2026-01-01")')
    .option('-u, --until <date>', 'Filter: created before this date (e.g., "yesterday", "2026-01-15")')
    .option('-P, --pretty', 'Human-friendly output', false)
    .option('-m, --memory', 'Search memory files instead of database', false)
    .option('--place <type>', 'Filter by place type: inbox, ref, wip, sandbox, board, sparks, archive')
    .action(async (query, options) => {
      try {
        // Markdown file search
        if (options.memory) {
          const { getMarkdownMemories } = await import('./core/memory/markdown/markdown-storage.js');
          const memoryFiles = await getMarkdownMemories({
            type: options.type as any,
            project: options.project,
          });
          
          // Simple text search (can be enhanced with QMD later)
          const searchLower = query.toLowerCase();
          const filtered = memoryFiles.filter(m => 
            m.content.toLowerCase().includes(searchLower) ||
            m.tags.some(t => t.toLowerCase().includes(searchLower))
          ).slice(0, validateLimit(options.limit, 10, 1, 100));
          
          if (options.pretty) {
            console.log(`\n  Memory Search: "${query}"`);
            console.log(`  Found ${filtered.length} results:\n`);
            filtered.forEach((r: any, i: number) => {
              console.log(`  ${i + 1}. [${r.type || 'memory'}] ${(r.content || '').substring(0, 60)}...`);
            });
            console.log('');
          } else {
            console.log(JSON.stringify({ ok: true, query, source: 'memory', count: filtered.length, results: filtered }, null, 2));
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
        let limited = filtered.slice(0, validateLimit(options.limit, 10, 1, 100));
        
        // Add place info to results
        const { getMemoryPlace } = await import('./core/places/index.js');
        const limitedWithPlace = await Promise.all(limited.map(async (r: any) => {
          const placeId = await getMemoryPlace(r.id);
          return { ...r, placeId };
        }));
        
        // Filter by place if specified
        if (options.place) {
          const placeFiltered = [];
          for (const r of limitedWithPlace) {
            if (r.placeId) {
              const { getPlace } = await import('./core/places/index.js');
              const place = await getPlace(r.placeId);
              if (place && place.placeType === options.place) {
                placeFiltered.push({ ...r, place: place.name || null, placeType: place.placeType || null });
              }
            }
          }
          limited = placeFiltered;
        } else if (limitedWithPlace.length > 0) {
          // Add place info to results even without filter
          for (const r of limitedWithPlace) {
            if (r.placeId) {
              const { getPlace } = await import('./core/places/index.js');
              const place = await getPlace(r.placeId);
              if (place) {
                r.place = place.name || null;
                r.placeType = place.placeType || null;
              }
            }
          }
          limited = limitedWithPlace;
        }
        
        if (options.pretty) {
          console.log(`\n  Search: "${query}"`);
          console.log(`  Found ${limited.length} results:\n`);
          limited.forEach((r: any, i: number) => {
            const placeTag = r.place ? ` (${r.place})` : '';
            console.log(`  ${i + 1}. [${r.type || 'memory'}] ${(r.content || '').substring(0, 60)}...${placeTag}`);
          });
          console.log('');
        } else {
          console.log(JSON.stringify({ ok: true, query, count: limited.length, since: options.since, until: options.until, placeFilter: options.place || null, results: limited }, null, 2));
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
        
        // Get memory content before deleting for hook
        const [memory] = await sqliteDb.select().from(schema.memories).where(eq(schema.memories.id, memoryId));
        
        await sqliteDb.delete(schema.memories).where(eq(schema.memories.id, memoryId));
        
        // Trigger memoryDeleted hook
        if (memory) {
          const { triggerMemoryDeleted } = await import('./core/memory/hooks.js');
          await triggerMemoryDeleted({
            memoryId: memory.id,
            content: memory.content,
            type: memory.type,
            tags: typeof memory.tags === 'string' ? memory.tags.split(',') : [],
            project: memory.projectId || undefined,
            source: memory.source || undefined,
            tier: memory.tier,
          });
        }
        
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

// learn command removed - absorbed into remember --learning-type

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
      
      // Get old memory for hook
      const [oldMemory] = await sqliteDb.select().from(schema.memories).where(eq(schema.memories.id, memoryId));
      
      await sqliteDb.update(schema.memories).set(updates).where(eq(schema.memories.id, memoryId));
      
      // Trigger memoryUpdated hook
      if (oldMemory) {
        const { triggerMemoryUpdated } = await import('./core/memory/hooks.js');
        const newContent = options.content || oldMemory.content;
        await triggerMemoryUpdated({
          memoryId: oldMemory.id,
          content: newContent,
          type: options.type || oldMemory.type,
          tags: options.tags ? options.tags.split(',') : (typeof oldMemory.tags === 'string' ? oldMemory.tags.split(',') : []),
          project: oldMemory.projectId || undefined,
          source: oldMemory.source || undefined,
          tier: oldMemory.tier,
          importance: oldMemory.importanceScore || oldMemory.relevanceScore || 50,
        }, oldMemory.content);
      }
      
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
  .option('--place <type>', 'Filter by place type: inbox, ref, wip, sandbox, board, sparks, archive')
  .action(async (query, options) => {
    try {
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(query);
      
      if (isUUID) {
        const memory = await getMemory(query);
        // Add place info to single memory retrieval
        if (memory) {
          const { getMemoryPlace, getPlace } = await import('./core/places/index.js');
          const placeId = await getMemoryPlace(memory.id);
          if (placeId) {
            const place = await getPlace(placeId);
            (memory as any).place = place?.name || null;
            (memory as any).placeType = place?.placeType || null;
          }
        }
        if (options.pretty && memory) {
          const placeInfo = (memory as any).place ? ` (${(memory as any).place})` : '';
          console.log(`\n  Memory: ${memory.id}`);
          console.log(`  Type: ${memory.type}`);
          console.log(`  Content: ${memory.content}\n`);
          if (placeInfo) console.log(`  Place: ${(memory as any).place}\n`);
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
          let limited = filtered.slice(0, validateLimit(options.limit, 5, 1, 100));
          
          // Add place info to results
          const { getMemoryPlace, getPlace } = await import('./core/places/index.js');
          const limitedWithPlace = await Promise.all(limited.map(async (r: any) => {
            const placeId = await getMemoryPlace(r.id);
            let placeInfo: any = {};
            if (placeId) {
              const place = await getPlace(placeId);
              placeInfo = { place: place?.name || null, placeType: place?.placeType || null };
            }
            return { ...r, ...placeInfo };
          }));
          
          // Filter by place if specified
          if (options.place) {
            limited = limitedWithPlace.filter((r: any) => r.placeType === options.place);
          } else {
            limited = limitedWithPlace;
          }
         
        if (options.pretty) {
          console.log(`\n  Recall: "${query}"`);
          console.log(`  Found ${limited.length} matches:\n`);
          limited.forEach((r: any, i: number) => {
            const placeTag = r.place ? ` (${r.place})` : '';
            console.log(`  ${i + 1}. [${r.type || 'memory'}] ${(r.content || '').substring(0, 60)}...${placeTag} (${(r.similarity ?? 0).toFixed(2)})`);
          });
          console.log('');
        } else {
          const matches = limited.map((r: any) => ({
            id: r.id,
            score: r.similarity ?? 0,
            type: r.type,
            content: r.content.length > 200 ? r.content.slice(0, 200) + '...' : r.content,
            tags: r.tags,
            place: r.place,
            placeType: r.placeType,
          }));
          console.log(JSON.stringify({ ok: true, query, count: matches.length, since: options.since, until: options.until, placeFilter: options.place || null, matches }, null, 2));
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
      .option('-m, --memory', 'Show memory file storage stats instead of database', false)
      .action(async (options) => {
        try {
          // Memory file stats
          if (options.memory) {
            const { getMemoryStats, isMemoryStorageAvailable } = await import('./core/memory/markdown/markdown-storage.js');
            const available = isMemoryStorageAvailable();
            if (!available) {
              console.log(JSON.stringify({ ok: false, error: 'Memory file storage not available' }, null, 2));
              process.exit(1);
            }
            const stats = await getMemoryStats();
            console.log(JSON.stringify({ ok: true, source: 'memory', ...stats }, null, 2));
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

  // squish note is now DEPRECATED - use "squish remember" instead
  // The unified remember tool handles note auto-detection

  // squish context - Show project context (memories + observations + places)
program
  .command('context')
  .description('Show project context or list available projects')
  .option('-p, --project <project>', 'Project path', getDefaultProjectPath())
  .option('-l, --limit <number>', 'Number of items to show', '10')
  .option('-i, --include <items>', 'What to include: memories, observations, entities, places', 'memories,observations,places')
  .option('--list-projects', 'List registered projects instead of loading context', false)
  .option('-j, --json', 'Output as JSON', false)
  .option('--place <type>', 'Filter by place type: inbox, ref, wip, sandbox, board, sparks, archive')
  .option('--tier <level>', 'Disclosure level: quick (place names), medium (top 3), full (all)', 'medium')
  .option('--has-memories', 'Only show places with memories', true)
  .option('--sync', 'Recalculate memory counts for all places', false)
  .option('--archive', 'Move memories > 30 days to Archive place', false)
  .option('--task <description>', 'Task description for auto-place detection (e.g., "fix bug", "design API")')
  .action(async (options) => {
    try {
      // Auto-detect place from task if provided
      let placeFilter = options.place || null;
      if (options.task && !placeFilter) {
        // Simple keyword detection
        const task = options.task.toLowerCase();
        if (task.includes('fix') || task.includes('bug') || task.includes('error')) placeFilter = 'wip';
        else if (task.includes('design') || task.includes('plan') || task.includes('api')) placeFilter = 'board';
        else if (task.includes('task') || task.includes('todo') || task.includes('manage')) placeFilter = 'inbox';
        else if (task.includes('test') || task.includes('experiment')) placeFilter = 'sandbox';
        else if (task.includes('learn') || task.includes('research') || task.includes('pattern')) placeFilter = 'ref';
        else if (task.includes('idea') || task.includes('concept') || task.includes('future')) placeFilter = 'sparks';
        if (placeFilter) console.log(`Auto-detected place: ${placeFilter}`);
      }
      
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
        return;
      }

      // Get project context
      const projectPath = resolveProjectPath(options.project);
      await ensureProject(projectPath);
      const project = await getOrCreateProject(projectPath);
      
      if (!project) {
        console.log(JSON.stringify({ ok: false, error: 'Project not found' }, null, 2));
        process.exit(1);
      }

      const limit = parseInt(options.limit);
      const include = (options.include || 'memories,observations,places').split(',');
      const tier = options.tier || 'full';
      const hasMemoriesOnly = options.hasMemories !== false;  // Default true now
      const existingPlaceFilter = options.place || null;
      
      const result: any = { project: project.name, tier };

      // Get memories
      if (include.includes('memories')) {
        const memories = await getRecent(projectPath, limit);
        result.memories = memories.map((m: any) => ({
          id: m.id,
          type: m.type,
          content: m.content?.substring(0, 100),
          tags: m.tags,
        }));
      }

      // Get observations (learnings)
      if (include.includes('observations')) {
        const { getObservations } = await import('./core/ingestion/learnings.js');
        const observations = await getObservations(projectPath, limit);
        result.observations = observations.map((o: any) => ({
          id: o.id,
          type: o.type,
          content: o.content?.substring(0, 100),
        }));
      }

      // Get places (spatial memory) with filtering
      if (include.includes('places')) {
        const { initializeDefaultPlaces, getProjectPlaces, walkPlace, getPlaceByType, syncAllPlaceMemoryCounts } = await import('./core/places/index.js');
        await initializeDefaultPlaces(project.id);
        
        // Sync memory counts if requested
        if (options.sync) {
          await syncAllPlaceMemoryCounts(project.id);
          console.log('Synced memory counts for all places.');
        }
        
        // Auto-archive old memories if requested
        if (options.archive) {
          const { autoArchiveOldMemories } = await import('./core/places/index.js');
          const archiveResult = await autoArchiveOldMemories(project.id, 30);
          console.log(`Archived ${archiveResult.archived} old memories to Archive (${archiveResult.failed} failed).`);
        }
        
        let places = await getProjectPlaces(project.id);
        
        // Apply --has-memories filter
        if (hasMemoriesOnly) {
          places = places.filter((p: any) => p.memoryCount > 0);
        }
        
        // Apply --place filter (from --place or --task auto-detect)
        if (placeFilter) {
          const filtered = places.filter((p: any) => p.placeType === placeFilter);
          if (filtered.length > 0) {
            places = filtered;
          }
        }
        
        // Format places based on tier
        if (tier === 'quick') {
          // Just place names (~50 tokens)
          result.places = places.map((p: any) => ({
            name: p.name,
            type: p.placeType,
          }));
        } else if (tier === 'medium') {
          // Top 3 memories per place (~170 tokens)
          const placesWithMemories = [];
          for (const p of places) {
            if (p.memoryCount > 0) {
              const walkResult = await walkPlace(project.id, p.placeType, {
                tokenBudget: 170,
                maxMemoriesPerPlace: 3,
                compressWithCompression: false,
              });
              placesWithMemories.push({
                name: p.name,
                type: p.placeType,
                purpose: p.purpose,
                memories: p.memoryCount,
                preview: walkResult?.memories.slice(0, 3).map((m: any) => m.content?.substring(0, 80)) || [],
              });
            }
          }
          result.places = placesWithMemories;
        } else {
          // Full - all memories (~500 tokens)
          result.places = places.map((p: any) => ({
            name: p.name,
            type: p.placeType,
            purpose: p.purpose,
            memories: p.memoryCount,
          }));
        }
      }

      if (options.json) {
        console.log(JSON.stringify({ ok: true, ...result }, null, 2));
      } else {
        // Human readable output
        console.log(`\n=== ${project.name} Context ===\n`);
        
        if (result.places && result.places.length > 0) {
          console.log('Spatial Memory Places:');
          result.places.forEach((p: any) => {
            if (tier === 'quick') {
              console.log(`  ${p.name} (${p.type})`);
            } else if (tier === 'medium') {
              console.log(`  ${p.name} (${p.memories} memories) - ${p.purpose}`);
              if (p.preview && p.preview.length > 0) {
                p.preview.forEach((m: string) => {
                  console.log(`    - ${m}...`);
                });
              }
            } else {
              console.log(`  ${p.name} (${p.memories} memories) - ${p.purpose}`);
            }
          });
          console.log('');
        }

        if (result.memories && result.memories.length > 0) {
          console.log('Recent Memories:');
          result.memories.slice(0, 5).forEach((m: any) => {
            console.log(`  [${m.type}] ${m.content}`);
          });
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

// clean command removed - now automatic via cron scheduler (auto_clean job)

await program.parseAsync(process.argv);
}

// MCP server: core/commands/mcp-server.ts
// Run with: npx squish-mcp
// ============================================================================
