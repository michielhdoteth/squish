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
import { checkDatabaseHealth, config } from './db/index.js';
import { checkRedisHealth, closeCache } from './core/cache.js';
import { rememberMemory, getMemoryById, searchMemories, updateConfidenceLevel } from './core/memory/memories.js';
import { searchConversations, getRecentConversations } from './core/search/conversations.js';
import { createObservation } from './core/observations.js';
import { getProjectContext } from './core/context.js';
import { setImportanceScore } from './core/memory/importance.js';
import { getMemoryStats } from './core/memory/stats.js';
import { ensureProject } from './core/projects.js';
import { consolidateMemories as consolidateMemoriesImpl, getConsolidationStats } from './core/memory/consolidation.js';
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
import { getRelatedMemories } from './core/associations.js';
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

const VERSION = '1.0.2';

// Load plugin manifest for self-verification
function loadPluginManifest(): any {
  try {
    const manifestPath = path.join(process.cwd(), 'config', 'plugin-manifest.json');
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
      await runMcpMode();
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
    const stats = await getMemoryStats(process.cwd());
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
    runMcpMode().catch((e) => {
      logger.error('Fatal error', e);
      process.exit(1);
    });
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

  // squish remember "content" --type fact --tags tag1,tag2
  program
    .command('remember <content>')
    .description('Store a memory')
    .option('-t, --type <type>', 'Memory type (observation, fact, decision, context, preference)', 'observation')
    .option('-T, --tags <tags>', 'Comma-separated tags', '')
    .option('-p, --project <project>', 'Project path', process.cwd())
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

  // squish search "query" --type fact --limit 10
  program
    .command('search <query>')
    .description('Search memories')
    .option('-t, --type <type>', 'Filter by memory type')
    .option('-l, --limit <number>', 'Max results', '10')
    .option('-p, --project <project>', 'Project path', process.cwd())
    .action(async (query, options) => {
      try {
        const results = await searchMemories({
          query,
          type: options.type,
          limit: parseInt(options.limit, 10),
          project: options.project,
        });
        console.log(JSON.stringify({ ok: true, query, count: results?.length || 0, results }, null, 2));
      } catch (error: any) {
        console.log(JSON.stringify({ ok: false, error: error.message }, null, 2));
        process.exit(1);
      }
    });

// squish get <memoryId> - Retrieve a memory by ID
program
  .command('get <memoryId>')
  .description('Retrieve a memory by ID')
  .action(async (memoryId) => {
    try {
      const memory = await getMemoryById(String(memoryId));
      console.log(JSON.stringify({ ok: true, found: !!memory, memory }, null, 2));
    } catch (error: any) {
      console.log(JSON.stringify({ ok: false, error: error.message }, null, 2));
      process.exit(1);
    }
  });

// squish recall <query> - Fuzzy natural language memory search
program
  .command('recall <query>')
  .description('Fuzzy natural language memory search (hybrid BM25 + vector)')
  .option('-l, --limit <number>', 'Max results', '5')
  .option('-t, --type <type>', 'Filter by memory type')
  .option('-p, --project <project>', 'Project path', process.cwd())
  .action(async (query, options) => {
    try {
      const results = await searchMemories({
        query,
        type: options.type,
        limit: parseInt(options.limit, 10),
        project: options.project,
      });
      const matches = results?.map((r: any) => ({
        id: r.id,
        score: r.similarity ?? 0,
        type: r.type,
        content: r.content.length > 200 ? r.content.slice(0, 200) + '...' : r.content,
        tags: r.tags,
      })) ?? [];
      console.log(JSON.stringify({ ok: true, query, count: matches.length, matches }, null, 2));
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
  // squish core_memory view
  // squish core_memory edit persona --content "I am helpful"
  // squish core_memory append user_info --text "Prefers TypeScript"
  program
    .command('core_memory')
    .description('Manage core memory (always-visible context)')
    .argument('[action]', 'view, edit, append', 'view')
    .option('-s, --section <section>', 'Section: persona, user_info, project_context, working_notes')
    .option('-c, --content <content>', 'New content (for edit)')
    .option('-t, --text <text>', 'Text to append (for append)')
    .option('-p, --project <project>', 'Project path', process.cwd())
    .action(async (action, options) => {
      try {
        const projectPath = options.project;
        const projectRecord = await ensureProject(projectPath);
        if (!projectRecord) {
          console.log(JSON.stringify({ ok: false, error: 'Project not found and could not be created' }, null, 2));
          process.exit(1);
        }
        const projectId = projectRecord.id;

        switch (action) {
          case 'view':
            await initializeCoreMemory(projectId);
            const core = await getCoreMemory(projectId);
            const stats = await getCoreMemoryStats(projectId);
            console.log(JSON.stringify({ ok: true, action, content: core, stats }, null, 2));
            break;

          case 'edit':
            if (!options.section || !options.content) {
              console.log(JSON.stringify({ ok: false, error: '--section and --content required for edit' }, null, 2));
              process.exit(1);
            }
            await initializeCoreMemory(projectId);
            const editResult = await editCoreMemorySection(projectId, options.section as any, String(options.content));
            console.log(JSON.stringify({ ok: editResult.success, action: 'edit', section: options.section, ...editResult }, null, 2));
            break;

          case 'append':
            if (!options.section || !options.text) {
              console.log(JSON.stringify({ ok: false, error: '--section and --text required for append' }, null, 2));
              process.exit(1);
            }
            await initializeCoreMemory(projectId);
            const appendResult = await appendCoreMemorySection(projectId, options.section as any, String(options.text));
            console.log(JSON.stringify({ ok: appendResult.success, action: 'append', section: options.section, ...appendResult }, null, 2));
            break;

          default:
            console.log(JSON.stringify({ ok: false, error: `Unknown action: ${action}` }, null, 2));
            process.exit(1);
        }
      } catch (error: any) {
        console.log(JSON.stringify({ ok: false, error: error.message }, null, 2));
        process.exit(1);
      }
    });

  // squish set-importance <memoryId> --importance 80
  program
    .command('set-importance <memoryId>')
    .description('Manually set importance score for a memory (0-100)')
    .option('-i, --importance <number>', 'Importance score (0-100)', '50')
    .action(async (memoryId, options) => {
      try {
        const score = parseInt(options.importance, 10);
        if (isNaN(score) || score < 0 || score > 100) {
          console.log(JSON.stringify({ ok: false, error: 'Importance must be between 0 and 100' }, null, 2));
          process.exit(1);
        }
        await setImportanceScore(String(memoryId), score);
        console.log(JSON.stringify({ ok: true, memoryId, importanceScore: score }, null, 2));
      } catch (error: any) {
        console.log(JSON.stringify({ ok: false, error: error.message }, null, 2));
        process.exit(1);
      }
    });

  // squish pin <memoryId>
  program
    .command('pin <memoryId>')
    .description('Pin a memory to prevent pruning/consolidation')
    .action(async (memoryId) => {
      try {
        await pinMemory(String(memoryId));
        console.log(JSON.stringify({ ok: true, memoryId, pinned: true }, null, 2));
      } catch (error: any) {
        console.log(JSON.stringify({ ok: false, error: error.message }, null, 2));
        process.exit(1);
      }
    });

  // squish unpin <memoryId>
  program
    .command('unpin <memoryId>')
    .description('Unpin a memory')
    .action(async (memoryId) => {
      try {
        await unpinMemory(String(memoryId));
        console.log(JSON.stringify({ ok: true, memoryId, pinned: false }, null, 2));
      } catch (error: any) {
        console.log(JSON.stringify({ ok: false, error: error.message }, null, 2));
        process.exit(1);
      }
    });

  // squish consolidate --project-id <id> --min-age 90
  program
    .command('consolidate')
    .description('Trigger manual memory consolidation')
    .option('-p, --project-id <id>', 'Project ID', process.cwd())
    .option('-a, --min-age <number>', 'Minimum age in days', '90')
    .option('-i, --max-importance <number>', 'Maximum importance to consolidate', '30')
    .option('-t, --threshold <number>', 'Similarity threshold (0-1)', '0.7')
    .option('-l, --limit <number>', 'Max memories to process', '100')
    .action(async (options) => {
      try {
        const results = await consolidateMemoriesImpl({
          projectId: String(options.projectId),
          minAge: parseInt(options.minAge, 10),
          maxImportance: parseInt(options.maxImportance, 10),
          similarityThreshold: parseFloat(options.threshold),
          limit: parseInt(options.limit, 10),
        });
        console.log(JSON.stringify({ ok: true, consolidated: results.length, results }, null, 2));
      } catch (error: any) {
        console.log(JSON.stringify({ ok: false, error: error.message }, null, 2));
        process.exit(1);
      }
    });

  // squish consolidation-stats --project-id <id>
  program
    .command('consolidation-stats')
    .description('Get consolidation statistics for a project')
    .option('-p, --project-id <id>', 'Project ID', process.cwd())
    .action(async (options) => {
      try {
        const stats = await getConsolidationStats(String(options.projectId));
        console.log(JSON.stringify({ ok: true, ...stats }, null, 2));
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
      .option('-p, --project <project>', 'Project path', process.cwd())
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

  // squish jot "my thought here" - quick brain dump
  program
    .command('jot <content>')
    .description('Quick brain dump - store a raw memory to process later')
    .option('-p, --project <project>', 'Project path', process.cwd())
    .action(async (content, options) => {
      try {
        const result = await rememberMemory({
          content,
          type: 'jot',
          tags: ['jot', 'unprocessed'],
          project: options.project,
        });
        console.log(JSON.stringify({ ok: true, message: 'Jot saved', id: result.id }, null, 2));
      } catch (error: any) {
        console.log(JSON.stringify({ ok: false, error: error.message }, null, 2));
        process.exit(1);
      }
    });

  await program.parseAsync(process.argv);
}

// ============================================================================
// MCP MODE (for Claude Code) - DEFAULT
// ============================================================================

async function runMcpMode() {
  const TOOLS = [
    // Core Memory Tool
    {
      name: 'core_memory',
      description: 'View or edit your core memory (always-visible). Use this to see your persona, user info, project context, and working notes.',
      inputSchema: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['view', 'edit', 'append'] },
          projectId: { type: 'string' },
          section: { type: 'string', enum: ['persona', 'user_info', 'project_context', 'working_notes'] },
          content: { type: 'string' },
          text: { type: 'string' },
        },
        required: ['action', 'projectId']
      }
    },
    // Context Paging
    {
      name: 'context_paging',
      description: 'Manage your working memory set. Load, evict, or view loaded memories.',
      inputSchema: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['load', 'evict', 'view'] },
          sessionId: { type: 'string' },
          memoryId: { type: 'string' },
        },
        required: ['action', 'sessionId']
      }
    },
    {
      name: 'context_status',
      description: 'View comprehensive context window status and token usage',
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: { type: 'string' },
          projectId: { type: 'string' },
        },
        required: ['sessionId', 'projectId']
      }
    },
    // Memory Tools
    {
      name: 'remember',
      description: 'Store information for future use. Perfect for facts, decisions, code snippets, configuration details, or user preferences.',
      inputSchema: {
        type: 'object',
        properties: {
          content: { type: 'string' },
          type: { type: 'string', enum: ['observation', 'fact', 'decision', 'context', 'preference'] },
          tags: { type: 'array', items: { type: 'string' } },
          project: { type: 'string' },
          metadata: { type: 'object' },
        },
        required: ['content']
      }
    },
    {
      name: 'recall',
      description: 'Retrieve a specific stored memory by ID',
      inputSchema: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id']
      }
    },
    {
      name: 'search',
      description: 'Search your stored memories. Leave query empty to list recent memories.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          scope: { type: 'string', enum: ['memories', 'conversations', 'recent'], default: 'memories' },
          type: { type: 'string', enum: ['observation', 'fact', 'decision', 'context', 'preference'] },
          tags: { type: 'array', items: { type: 'string' } },
          limit: { type: 'number', default: 10 },
          project: { type: 'string' },
        }
      }
    },
    {
      name: 'observe',
      description: 'Record an observation about your work (tool usage, patterns, errors)',
      inputSchema: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['tool_use', 'file_change', 'error', 'pattern', 'insight'] },
          action: { type: 'string' },
          target: { type: 'string' },
          summary: { type: 'string' },
          details: { type: 'object' },
        },
        required: ['type', 'action', 'summary']
      }
    },
    {
      name: 'context',
      description: 'Get project context',
      inputSchema: {
        type: 'object',
        properties: {
          project: { type: 'string' },
          include: { type: 'array', items: { type: 'string' }, default: ['memories', 'observations'] },
          limit: { type: 'number', default: 10 }
        },
        required: ['project']
      }
    },
    {
      name: 'init',
      description: 'Initialize Squish memory system for the current project',
      inputSchema: {
        type: 'object',
        properties: { projectPath: { type: 'string' } }
      }
    },
    {
      name: 'health',
      description: 'Check service status',
      inputSchema: { type: 'object', properties: {} }
    },
    {
      name: 'merge',
      description: 'Manage memory merges: detect, list, preview, approve, reject, reverse',
      inputSchema: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['detect', 'list', 'preview', 'stats', 'approve', 'reject', 'reverse'] },
          projectId: { type: 'string' },
          proposalId: { type: 'string' },
          threshold: { type: 'number' },
        },
        required: ['action']
      }
    },
    {
      name: 'qmd_search',
      description: 'Search memories using QMD hybrid search (BM25 + vector + rerank)',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          type: { type: 'string', enum: ['observation', 'fact', 'decision', 'context', 'preference'] },
          limit: { type: 'number', default: 10 },
        },
        required: ['query']
      }
    },
    // v0.8.0: Importance Scoring Tools
    {
      name: 'set_importance',
      description: 'Manually set importance score for a memory (0-100)',
      inputSchema: {
        type: 'object',
        properties: {
          memoryId: { type: 'string' },
          importance: { type: 'number', minimum: 0, maximum: 100 },
        },
        required: ['memoryId', 'importance']
      }
    },
    {
      name: 'pin_memory',
      description: 'Pin a memory to prevent pruning/consolidation (or unpin it)',
      inputSchema: {
        type: 'object',
        properties: {
          memoryId: { type: 'string' },
          pinned: { type: 'boolean', default: true },
        },
        required: ['memoryId']
      }
    },
    // v0.8.0: Consolidation Tool
    {
      name: 'consolidate',
      description: 'Trigger manual memory consolidation - summarizes old, low-importance memories',
      inputSchema: {
        type: 'object',
        properties: {
          projectId: { type: 'string' },
          threshold: { type: 'number', default: 0.7 },
          minAge: { type: 'number', default: 90 },
          limit: { type: 'number', default: 100 },
        },
        required: ['projectId']
      }
    },
    {
      name: 'consolidation_stats',
      description: 'Get consolidation statistics for a project',
      inputSchema: {
        type: 'object',
        properties: {
          projectId: { type: 'string' },
        },
        required: ['projectId']
      }
    }
  ] as const;

  class Squish {
    private server: Server;
    private projectPath: string;

    constructor() {
      this.projectPath = process.env.CLAUDE_WORKING_DIRECTORY || process.cwd();

      this.server = new Server(
        { name: 'squish', version: VERSION },
        {
          capabilities: { tools: {} },
        }
      );
      this.setup();
    }

    private async onSessionInitialized() {
      if (!shouldAutoLoad()) {
        logger.info('[Session] Auto-load disabled');
        return;
      }

      try {
        logger.info('[Session] Performing auto-load...');
        const result = await performAutoLoad(this.projectPath, getAutoLoadConfig());

        if (result.warnings.length > 0) {
          logger.warn('[Session] Auto-load warnings:', result.warnings);
        }

        logger.info(`[Session] Auto-load complete: ${result.memoriesLoaded} memories, ~${result.tokensUsed} tokens`);
      } catch (error) {
        logger.error('[Session] Auto-load failed:', error);
      }
    }

    private setup() {
      this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
        tools: TOOLS as unknown as typeof TOOLS
      }));

      this.server.setRequestHandler(CallToolRequestSchema, async (req) => {
        const { name } = req.params;
        const args = (req.params.arguments ?? {}) as Record<string, unknown>;

        try {
          switch (name) {
            case 'core_memory':
              return await this.handleCoreMemory(args);
            case 'context_paging':
              return await this.handleContextPaging(args);
            case 'context_status': {
              const result = await getContextStatus(String(args.sessionId), String(args.projectId));
              return this.jsonResponse({ ok: true, ...result });
            }
            case 'remember': {
              return this.jsonResponse({ ok: true, data: await rememberMemory(args as any) });
            }
            case 'recall': {
              const memory = await getMemoryById(String(args.id));
              return this.jsonResponse({ ok: true, found: !!memory, data: memory });
            }
            case 'search': {
              return this.jsonResponse({ ok: true, data: await searchMemories(args as any) });
            }
            case 'observe':
              return this.jsonResponse({ ok: true, data: await createObservation(args as any) });
            case 'context':
              return this.jsonResponse({ ok: true, data: await getProjectContext(args as any) });
            case 'init': {
              await ensureDataDirectory();
              const project = await ensureProject(args.projectPath as string || process.cwd());
              return this.jsonResponse({ success: true, project });
            }
            case 'health':
              return this.health();
            case 'merge':
              return await this.handleMerge(args);
            case 'qmd_search': {
              const available = await isQMDAvailable();
              if (!available) {
                return this.jsonResponse({ ok: true, qmdAvailable: false, data: await searchMemories(args as any) });
              }
              return this.jsonResponse({ ok: true, qmdAvailable: true, data: await searchWithQMD(args as any) });
            }
            // v0.8.0: Importance scoring tools
            case 'set_importance': {
              await setImportanceScore(String(args.memoryId), Number(args.importance));
              return this.jsonResponse({
                ok: true,
                message: `Importance score set to ${args.importance} for memory ${args.memoryId}`
              });
            }
            case 'pin_memory': {
              const pinned = args.pinned !== undefined ? Boolean(args.pinned) : true;
              if (pinned) {
                await pinMemory(String(args.memoryId));
              } else {
                await unpinMemory(String(args.memoryId));
              }
              return this.jsonResponse({
                ok: true,
                message: `Memory ${args.memoryId} ${pinned ? 'pinned' : 'unpinned'}`
              });
            }
            // v0.8.0: Consolidation tools
            case 'consolidate': {
              const results = await consolidateMemoriesImpl({
                projectId: String(args.projectId),
                minAge: args.minAge ? Number(args.minAge) : 90,
                maxImportance: 30,
                similarityThreshold: args.threshold ? Number(args.threshold) : 0.7,
                limit: args.limit ? Number(args.limit) : 100,
              });
              return this.jsonResponse({
                ok: true,
                consolidated: results.length,
                results
              });
            }
            case 'consolidation_stats': {
              const stats = await getConsolidationStats(String(args.projectId));
              return this.jsonResponse({ ok: true, ...stats });
            }
            default:
              throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
          }
        } catch (error) {
          if (error instanceof McpError) throw error;
          throw new McpError(ErrorCode.InternalError, `Tool '${name}' failed`);
        }
      });

      this.server.onerror = (e) => logger.error('MCP Server error', e);
      process.on('SIGINT', () => this.shutdown());
      process.on('SIGTERM', () => this.shutdown());
    }

    private jsonResponse(payload: unknown) {
      return {
        content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }]
      };
    }

    private async handleCoreMemory(args: Record<string, unknown>) {
      const action = args.action as string;
      const projectId = String(args.projectId);

      await initializeCoreMemory(projectId);

      const actions = {
        view: async () => {
          const content = await getCoreMemory(projectId);
          const stats = await getCoreMemoryStats(projectId);
          return this.jsonResponse({ ok: true, action: 'view', content, stats });
        },
        edit: async () => {
          const result = await editCoreMemorySection(projectId, args.section as any, String(args.content));
          return this.jsonResponse({ ok: true, action: 'edit', ...result });
        },
        append: async () => {
          const result = await appendCoreMemorySection(projectId, args.section as any, String(args.text));
          return this.jsonResponse({ ok: true, action: 'append', ...result });
        },
      };

      const handler = actions[action as keyof typeof actions];
      if (!handler) throw new McpError(ErrorCode.InvalidParams, `Unknown action: ${action}`);
      return handler();
    }

    private async handleContextPaging(args: Record<string, unknown>) {
      const action = args.action as string;
      const sessionId = String(args.sessionId);

      const actions = {
        load: () => loadMemoryToContext(sessionId, String(args.memoryId)),
        evict: () => evictMemoryFromContext(sessionId, String(args.memoryId)),
        view: () => viewLoadedMemories(sessionId),
      };

      const handler = actions[action as keyof typeof actions];
      if (!handler) throw new McpError(ErrorCode.InvalidParams, `Unknown action: ${action}`);
      return this.jsonResponse(await handler());
    }

    private async handleMerge(args: Record<string, unknown>) {
      const action = args.action as string;

      const handlers = {
        detect: () => handleDetectDuplicates(args as any),
        list: () => handleListProposals(args as any),
        preview: () => handlePreviewMerge(args as any),
        stats: () => handleGetMergeStats(args as any),
        approve: () => handleApproveMerge(args as any),
        reject: () => handleRejectMerge(args as any),
        reverse: () => handleReverseMerge(args as any),
      };

      const handler = handlers[action as keyof typeof handlers];
      if (!handler) throw new McpError(ErrorCode.InvalidParams, `Unknown action: ${action}`);
      return this.jsonResponse(await handler());
    }

    private async shutdown() {
      await closeCache();
      process.exit(0);
    }

    private async health() {
      const dbOk = await checkDatabaseHealth();
      const redisOk = await checkRedisHealth();
      return this.jsonResponse({
        version: VERSION,
        mode: config.isTeamMode ? 'team' : 'local',
        status: dbOk ? 'ok' : 'error',
      });
    }

    async run() {
      // Verify plugin manifest (universal plugin self-check)
      const manifest = loadPluginManifest();
      const verification = verifyManifest(manifest);
      if (!verification.ok) {
        logger.warn('Plugin manifest verification failed:', verification.errors);
      } else {
        logger.info(`Squish v${VERSION} - Plugin manifest verified`);
      }
    
      const transport = new StdioServerTransport();
      await this.server.connect(transport);
      logger.info(`v${VERSION}`);

      registerJobHandler('nightly_maintenance', runNightlyJob);
      registerJobHandler('weekly_maintenance', runWeeklyJob);
      await initializeScheduler();
      startHeartbeatChecking();
      await this.onSessionInitialized();
      await heartbeat();

      startWebServer();
    }
  }

  new Squish().run();
}
