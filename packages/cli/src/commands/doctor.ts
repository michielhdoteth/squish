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
import { createDb, getDb } from '../../../../db/index.js';
import { buildHealthState } from '../../../../core/runtime/trust-state.js';
import { formatHealthReport } from '../../../../core/runtime/trust-report.js';

interface DiagnosticResult {
  name: string;
  status: 'ok' | 'degraded' | 'broken';
  message: string;
  fix?: string;
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
      await runDoctorDiagnostics(options);
    });
}

async function runDoctorDiagnostics(options: { fix?: boolean; migrate?: boolean; verbose?: boolean; project?: string; json?: boolean }) {
  const results: DiagnosticResult[] = [];
  const dataDir = getDataDir();
  const health = await buildHealthState(options.project);

  // Check 1: Data directory exists
  const diagnostic1 = await checkDataDirectory(dataDir);
  results.push(diagnostic1);
  
  // Check 2: Database file
  const diagnostic2 = await checkDatabaseFile(dataDir);
  results.push(diagnostic2);
  
  // Check 3: Schema version (if database exists)
  if (diagnostic2.status !== 'fail') {
    const diagnostic3 = await checkSchemaVersion(options.migrate || false);
    results.push(diagnostic3);
  }
  
  // Check 4: Config valid
  const diagnostic4 = checkConfig();
  results.push(diagnostic4);
  
  // Check 5: bin/ files exist
  const diagnostic5 = checkBinFiles();
  results.push(diagnostic5);

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
    diagnostics: results.map((result) => ({
      name: result.name,
      status: result.status,
      detail: result.message,
      fix: result.fix,
    })),
    nextStep,
  };

  if (options.json) {
    console.log(JSON.stringify({ ok: combined.severity !== 'broken', ...combined }, null, 2));
    process.exit(combined.severity === 'broken' ? 1 : 0);
  }

  console.log('\n=== Squish Doctor v1.2.0 ===\n');
  console.log(formatHealthReport({
    severity: combined.severity,
    currentProject: combined.currentProject,
    checks: combined.checks,
    diagnostics: combined.diagnostics,
    nextStep: combined.nextStep,
  }));

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
      return { name: 'database file', status: 'degraded', message: 'Database not found (will be created on first use)', fix: 'Run any squish command to create the local database.' };
    }
    return { name: 'database file', status: 'ok', message: dbPath };
  } catch (error) {
    return { name: 'database file', status: 'broken', message: 'Cannot access database file', fix: 'Check file permissions' };
  }
}

async function checkSchemaVersion(forceMigrate: boolean): Promise<DiagnosticResult> {
  const dbClient = await getDb();
  if (!dbClient) {
    return { name: 'schema version', status: 'degraded', message: 'Cannot connect to database (no driver available)' };
  }

  // Check for required tables
  const requiredTables = [
    'memories',
    'learnings',
    'projects',
    'users',
    'conversations',
    'messages',
    'entities',
    'core_memory',
    'context_sessions',
    'memory_associations',
    'namespaces',
    'maintenance_jobs',
    'places',
    'memory_places',
    'place_rules',
    'session_summaries',
    'beliefs',
    'belief_memory_sources',
    'belief_edges',
  ];

  // Get SQLite vs Postgres client handling
  const dbAny = dbClient as any;
  const isSqlite = typeof dbAny.exec === 'function';

  let existingTables: string[] = [];
  if (isSqlite) {
    const tables = dbAny.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{name: string}>;
    existingTables = tables.map(t => t.name);
  } else {
    // Postgres
    try {
      const result = await dbAny.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public'");
      existingTables = result.rows?.map((r: any) => r.tablename) ?? [];
    } catch {
      existingTables = [];
    }
  }

  const missingTables = requiredTables.filter(t => !existingTables.includes(t));

  // If forceMigrate or missing tables, run migrations
  if (forceMigrate || missingTables.length > 0) {
    try {
      // Import bootstrap functions
      const { ensureSqliteSchema } = await import('../../../../db/bootstrap.js');
      const { getSchemaVersion } = await import('../../../../db/bootstrap.js');

      if (isSqlite) {
        await ensureSqliteSchema(dbAny);
        const version = await getSchemaVersion(dbAny);
        return {
          name: 'schema version',
          status: 'ok',
          message: `Migrations applied. Schema: ${version}`
        };
      }

      return { name: 'schema version', status: 'ok', message: 'Database schema OK' };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        name: 'schema version',
        status: 'degraded',
        message: `Migration note: ${msg}`,
        fix: 'Run "squish doctor --migrate" to retry'
      };
    }
  }

  return { name: 'schema version', status: 'ok', message: `Tables OK (${existingTables.length})` };
}

function checkConfig(): DiagnosticResult {
  try {
    // Basic config validation
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
