/**
 * Squish Doctor Command
 *
 * Diagnose and fix common Squish issues automatically.
 *
 * Usage:
 *   squish doctor              # Run diagnostics
 *   squish doctor --fix       # Auto-fix issues
 *   squish doctor --migrate   # Force run database migrations
 */

import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import { getDataDir, config } from '../../../../config.js';
import { getDb } from '../../../../db/index.js';
import { ensurePostgresSchema, ensureSqliteSchema } from '../../../../db/bootstrap.js';
import { getInstallShadowDiagnostic } from '../../../../core/runtime/install-diagnostics.js';
import {
  probeSchemaHealth,
  checkGraphEntitiesTable,
  checkPlacesInitialization,
  checkConsolidationState,
  checkMemoryVersionsTable,
  fixSchemaIssues,
  type CheckResult,
} from '../../../../db/schema-health.js';
import { buildHealthState } from '../../../../core/runtime/trust-state.js';
import { formatHealthReport } from '../../../../core/runtime/trust-report.js';

interface DiagnosticResult {
  name: string;
  status: 'ok' | 'degraded' | 'broken';
  message: string;
  fix?: string;
}

// FTS schema check function
async function checkFTSchema(): Promise<DiagnosticResult> {
  try {
    const db = await getDb();
    // For SQLite, we can query table_info
    const cols = db.prepare("PRAGMA table_info(memories_fts)").all();
    const colNames = cols.map((c: any) => c.name);
    
    const requiredColumns = ['content', 'tags', 'summary'];
    const missing = requiredColumns.filter(c => !colNames.includes(c));
    
    if (missing.length === 0) {
      return { name: 'FTS schema', status: 'ok', message: 'FTS table has all required columns' };
    }
    
    return {
      name: 'FTS schema',
      status: 'broken',
      message: `FTS table missing columns: ${missing.join(', ')}`,
      fix: 'Run "squish doctor --migrate" to repair FTS schema'
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return {
      name: 'FTS schema',
      status: 'degraded',
      message: `Cannot check FTS schema: ${msg}`,
      fix: 'Run "squish doctor --migrate" to initialize/repair FTS schema'
    };
  }
}

export function registerDoctorCommand(program: Command) {
  program
    .command('doctor')
    .description('Diagnose and fix Squish issues')
    .option('-f, --fix', 'Auto-fix issues when possible')
    .option('-m, --migrate', 'Force run database migrations')
    .option('-v, --verbose', 'Show detailed output')
    .option('-p, --project <project>', 'Project path')
    .option('--json', 'Emit machine-readable output', false)
    .action(async (options) => {
      const previousQuiet = process.env.SQUISH_QUIET;
      if (options.json) {
        process.env.SQUISH_QUIET = '1';
      }
      try {
        await runDoctorDiagnostics(options);
      } finally {
        if (options.json) {
          if (previousQuiet === undefined) {
            delete process.env.SQUISH_QUIET;
          } else {
            process.env.SQUISH_QUIET = previousQuiet;
          }
        }
      }
    });
}

async function runDoctorDiagnostics(options: { fix?: boolean; migrate?: boolean; verbose?: boolean; project?: string; json?: boolean }) {
  const results: DiagnosticResult[] = [];
  const fixActions: string[] = [];
  const dataDir = getDataDir();

  // Check 1: Data directory exists
  const diagnostic1 = await checkDataDirectory(dataDir);
  results.push(diagnostic1);
  
  // Check 2: Database file
  const diagnostic2 = await checkDatabaseFile(dataDir);
  results.push(diagnostic2);
  
  // Check 3: Schema version (if database exists)
  if (diagnostic2.status !== 'broken') {
    const diagnostic3 = await checkSchemaVersion(options.migrate || false, options.fix || false, fixActions);
    results.push(diagnostic3);
  }
  
  // Check 4: Config valid
  const diagnostic4 = checkConfig();
  results.push(diagnostic4);
  
  // Check 5: bin/ files exist
  const diagnostic5 = checkBinFiles();
  results.push(diagnostic5);
  const diagnostic6 = checkRuntimeInstallShadowing();
  results.push(diagnostic6);
  
  // Check 7: FTS schema validation
  const diagnostic7 = await checkFTSchema();
  results.push(diagnostic7);
  
  // Check 8: LLM availability (optional, non-blocking)
  const diagnostic8 = checkLLM();
  results.push(diagnostic8);

  // Check 9: Graph entities table
  const diagnostic9 = await checkGraphEntitiesTable();
  results.push(diagnostic9);

  // Check 10: Places initialization
  const diagnostic10 = await checkPlacesInitialization();
  results.push(diagnostic10);

  // Check 11: Consolidation state
  const diagnostic11 = await checkConsolidationState();
  results.push(diagnostic11);

  // Check 12: Memory versions table (optional)
  const diagnostic12 = await checkMemoryVersionsTable();
  results.push(diagnostic12);

  // Run comprehensive --fix if requested
  if (options.fix) {
    const wasBroken = results.filter(r => r.status === 'broken' || r.status === 'degraded');
    if (wasBroken.length > 0) {
      if (!options.json) {
        console.log('\nApplying auto-fixes...\n');
      }
      const repairActions = await fixSchemaIssues({
        fixAll: true,
        verbose: !options.json,
      });

      for (const action of repairActions) {
        fixActions.push(action.detail);
        if (!options.json) {
          console.log(`  [${action.type}] ${action.detail}`);
        }
      }

      if (repairActions.length > 0 && !options.json) {
        console.log('');
      }

      // Re-run diagnostics to get updated state
      const updated: DiagnosticResult[] = [];

      const u1 = await checkDataDirectory(dataDir);
      updated.push(u1);
      const u2 = await checkDatabaseFile(dataDir);
      updated.push(u2);
      if (u2.status !== 'broken') {
        const u3 = await checkSchemaVersion(false, false, []);
        updated.push(u3);
      }
      updated.push(checkConfig());
      updated.push(checkBinFiles());
      updated.push(checkRuntimeInstallShadowing());
      updated.push(await checkFTSchema());
      updated.push(checkLLM());
      updated.push(await checkGraphEntitiesTable());
      updated.push(await checkPlacesInitialization());
      updated.push(await checkConsolidationState());
      updated.push(await checkMemoryVersionsTable());

      // Replace results with updated ones
      results.length = 0;
      results.push(...updated);
    } else if (!options.json) {
      console.log('No issues to fix.');
    }
  }
  
  const schemaProbe = await probeSchemaHealth();

  let health;
  try {
    health = await buildHealthState(options.project);
  } catch (error: any) {
    health = {
      severity: 'degraded' as const,
      currentProject: options.project || process.cwd(),
      checks: [
        {
          name: 'runtime health',
          status: 'degraded' as const,
          detail: `Skipped until schema is readable: ${error.message}`,
        },
      ],
      nextStep: 'Run `squish doctor --migrate` to repair the local schema, then rerun diagnostics.',
    };
  }

  const combinedSeverity = [health.severity, ...results.map((result) => result.status)].includes('broken')
    ? 'broken'
    : ([health.severity, ...results.map((result) => result.status)].includes('degraded') ? 'degraded' : 'ok');
  const nextStep =
    health.nextStep ??
    results.find((result) => result.fix)?.fix ??
    (options.fix ? 'Apply the suggested fixes, then rerun `squish doctor`.' : null);

  const combined = {
    severity: combinedSeverity as 'ok' | 'degraded' | 'broken',
    currentProject: health.currentProject,
    checks: health.checks,
    backend: config.isRemoteMode ? `remote:${config.remoteBackend}` : (config.isTeamMode ? `team:${config.teamBackend}` : 'local:sqlite'),
    schemaStatus: schemaProbe.status,
    missingTables: schemaProbe.missingTables,
    remediationCommand: schemaProbe.remediation ?? 'squish doctor --migrate',
    diagnostics: results.map((result) => ({
      name: result.name,
      status: result.status,
      detail: result.message,
      fix: result.fix,
    })),
    nextStep,
    fixesApplied: options.fix ? fixActions : undefined,
  };

  if (options.json) {
    console.log(JSON.stringify({ ok: combined.severity !== 'broken', ...combined }, null, 2));
    process.exit(combined.severity === 'broken' ? 1 : 0);
  }

  console.log('\n=== Squish Doctor v1.2.3 ===\n');
  console.log(formatHealthReport({
    severity: combined.severity,
    currentProject: combined.currentProject,
    checks: combined.checks,
    diagnostics: combined.diagnostics,
    nextStep: combined.nextStep,
  }));

  if (fixActions.length > 0) {
    console.log('\nFixes applied:');
    for (const fix of fixActions) {
      console.log(`  - ${fix}`);
    }
  }

  if (options.verbose) {
    console.log('\nDiagnostic detail');
    for (const result of results) {
      console.log(`- ${result.name}: ${result.message}`);
      if (result.fix) {
        console.log(`  fix: ${result.fix}`);
      }
    }
  }

  process.exit(combined.severity === 'broken' ? 1 : 0);
}

async function checkDataDirectory(dataDir: string): Promise<DiagnosticResult> {
  try {
    if (!fs.existsSync(dataDir)) {
      // Try to create it
      fs.mkdirSync(dataDir, { recursive: true });
      return { name: 'data directory', status: 'ok', message: 'Created data directory' };
    }
    return { name: 'data directory', status: 'ok', message: dataDir };
  } catch (error) {
    return { name: 'data directory', status: 'broken', message: 'Cannot access data directory', fix: 'Check file permissions' };
  }
}

async function checkDatabaseFile(dataDir: string): Promise<DiagnosticResult> {
  const dbPath = path.join(dataDir, 'squish.db');
  
  try {
    if (!fs.existsSync(dbPath)) {
      return { name: 'database file', status: 'degraded', message: 'Database not found yet (first local write will create it)', fix: 'Run a normal Squish command or `squish doctor --migrate` to initialize local storage.' };
    }
    return { name: 'database file', status: 'ok', message: dbPath };
  } catch (error) {
    return { name: 'database file', status: 'broken', message: 'Cannot access database file', fix: 'Check file permissions' };
  }
}

async function checkSchemaVersion(forceMigrate: boolean, forceFix: boolean, fixActions: string[]): Promise<DiagnosticResult> {
  const probe = await probeSchemaHealth();

  // When --fix is active, run the full fixSchemaIssues
  if (forceFix && (probe.status === 'drifted' || probe.missingTables.length > 0)) {
    try {
      const actions = await fixSchemaIssues({ fixAll: true, verbose: false });
      for (const a of actions) {
        fixActions.push(a.detail);
      }

      const rechecked = await probeSchemaHealth();
      if (rechecked.status === 'ok') {
        return { name: 'schema version', status: 'ok', message: `Auto-fixed. ${rechecked.detail}` };
      }

      return {
        name: 'schema version',
        status: rechecked.status === 'drifted' ? 'broken' : 'degraded',
        message: rechecked.detail,
        fix: rechecked.remediation ? `Run "${rechecked.remediation}" to retry` : undefined,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        name: 'schema version',
        status: 'degraded',
        message: `Auto-fix note: ${msg}`,
        fix: 'Run "squish doctor --migrate" to retry',
      };
    }
  }

  if (!forceMigrate) {
    if (probe.status === 'ok') {
      return { name: 'schema version', status: 'ok', message: probe.detail };
    }
    if (probe.status === 'drifted') {
      return {
        name: 'schema version',
        status: 'broken',
        message: probe.detail,
        fix: `Run "${probe.remediation}" to repair the schema`,
      };
    }
    return {
      name: 'schema version',
      status: 'degraded',
      message: probe.detail,
      fix: probe.remediation ? `Run "${probe.remediation}" after fixing connectivity` : undefined,
    };
  }

  try {
    const dbClient = await getDb();
    const raw = (dbClient as any).$client ?? dbClient;

    if (raw && typeof raw.prepare === 'function') {
      // Run ensureSqliteSchema, tolerating second-pass failures
      // for existing tables with incomplete column sets
      await ensureSqliteSchema(raw).catch(() => {});
    } else if (raw && typeof raw.query === 'function') {
      await ensurePostgresSchema(raw);
    } else if (config.isTeamMode || config.isRemoteMode) {
      throw new Error('The active backend does not expose a migratable raw SQL client');
    } else {
      throw new Error('Unable to access the local SQLite client for repair');
    }

    const rechecked = await probeSchemaHealth();
    if (rechecked.status === 'ok') {
      return { name: 'schema version', status: 'ok', message: `Migrations applied. ${rechecked.detail}` };
    }

    return {
      name: 'schema version',
      status: rechecked.status === 'drifted' ? 'broken' : 'degraded',
      message: rechecked.detail,
      fix: rechecked.remediation ? `Run "${rechecked.remediation}" to retry` : undefined,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return {
      name: 'schema version',
      status: 'degraded',
      message: `Migration note: ${msg}`,
      fix: 'Run "squish doctor --migrate" to retry',
    };
  }
}

function checkLLM(): DiagnosticResult {
  const enabled = config.llmEnabled || config.llm?.enabled || false;
  const hasKey = !!(config.llmApiKey || process.env.SQUISH_LLM_API_KEY || process.env.OPENAI_API_KEY);
  const provider = config.llmProvider || config.llm?.provider || 'not set';
  const hasEndpoint = !!(config.llmEndpoint || config.llm?.endpoint);

  if (enabled && hasKey) {
    return {
      name: 'LLM',
      status: 'ok',
      message: `LLM enabled (provider: ${provider}, model: ${config.llmExtractionModel || 'default'})`
    };
  }

  if (hasKey && !enabled) {
    return {
      name: 'LLM',
      status: 'degraded',
      message: `LLM API key found but LLM not enabled (provider: ${provider})`,
      fix: 'Set SQUISH_LLM_ENABLED=true or llm.enabled=true in settings.json'
    };
  }

  if (!hasKey && !enabled) {
    return {
      name: 'LLM',
      status: 'degraded',
      message: 'LLM not configured (optional - Squish works without it)',
      fix: 'Set SQUISH_LLM_ENABLED=true, SQUISH_LLM_API_KEY=sk-..., and SQUISH_LLM_PROVIDER=openai (or anthropic, ollama, lmstudio)'
    };
  }

  return {
    name: 'LLM',
    status: 'degraded',
    message: 'LLM enabled but no API key configured',
    fix: 'Set SQUISH_LLM_API_KEY or SQUISH_OPENAI_API_KEY environment variable'
  };
}

function checkConfig(): DiagnosticResult {
  try {
    const dataDir = getDataDir();
    const embeddingsProvider = config.embeddingsProvider;
    
    return { 
      name: 'configuration', 
      status: 'ok', 
      message: `Provider: ${embeddingsProvider}, Data: ${dataDir}` 
    };
  } catch (error) {
    return { name: 'configuration', status: 'broken', message: 'Config validation failed', fix: 'Check config.ts' };
  }
}

function checkBinFiles(): DiagnosticResult {
  const binDir = path.join(process.cwd(), 'bin');
  
  try {
    const files = ['squish.mjs', 'squish-mcp.mjs', 'install-interactive.mjs'];
    const missing: string[] = [];
    
    for (const file of files) {
      if (!fs.existsSync(path.join(binDir, file))) {
        missing.push(file);
      }
    }
    
    if (missing.length > 0) {
      return { name: 'cli binaries', status: 'broken', message: `Missing: ${missing.join(', ')}` };
    }
    
    return { name: 'cli binaries', status: 'ok', message: 'All binaries present' };
  } catch (error) {
    return { name: 'cli binaries', status: 'broken', message: 'Cannot check binaries', fix: 'Reinstall squish-memory' };
  }
}

function checkRuntimeInstallShadowing(): DiagnosticResult {
  const diagnostic = getInstallShadowDiagnostic();
  if (diagnostic.status === 'ok') {
    return { name: 'global runtime resolution', status: 'ok', message: diagnostic.detail };
  }

  return {
    name: 'global runtime resolution',
    status: 'broken',
    message: diagnostic.detail,
    fix: diagnostic.remediation.join(' | '),
  };
}
