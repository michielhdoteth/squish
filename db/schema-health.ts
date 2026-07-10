import fs from 'node:fs';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import { config } from '../config.js';
import { getDataDir } from '../config.js';
import { getDb } from './index.js';
import { ensureSqliteSchema, ensurePostgresSchema } from './bootstrap.js';

const REQUIRED_TABLES = [
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
] as const;

const REQUIRED_INDEXES = [
  { table: 'memories', name: 'memories_project_idx', sql: 'CREATE INDEX IF NOT EXISTS memories_project_idx ON memories(project_id)' },
  { table: 'memories', name: 'memories_type_idx', sql: 'CREATE INDEX IF NOT EXISTS memories_type_idx ON memories(type)' },
  { table: 'memories', name: 'memories_created_idx', sql: 'CREATE INDEX IF NOT EXISTS memories_created_idx ON memories(created_at)' },
  { table: 'memories', name: 'memories_tags_idx', sql: 'CREATE INDEX IF NOT EXISTS memories_tags_idx ON memories(tags)' },
  { table: 'conversations', name: 'conversations_project_idx', sql: 'CREATE INDEX IF NOT EXISTS conversations_project_idx ON conversations(project_id)' },
  { table: 'conversations', name: 'conversations_session_idx', sql: 'CREATE INDEX IF NOT EXISTS conversations_session_idx ON conversations(session_id)' },
  { table: 'learnings', name: 'learnings_project_idx', sql: 'CREATE INDEX IF NOT EXISTS learnings_project_idx ON learnings(project_id)' },
  { table: 'entities', name: 'entities_project_idx', sql: 'CREATE INDEX IF NOT EXISTS entities_project_idx ON entities(project_id)' },
  { table: 'places', name: 'places_project_idx', sql: 'CREATE INDEX IF NOT EXISTS places_project_idx ON places(project_id)' },
  { table: 'places', name: 'places_type_idx', sql: 'CREATE INDEX IF NOT EXISTS places_type_idx ON places(place_type)' },
  { table: 'entity_relations', name: 'relations_from_idx', sql: 'CREATE INDEX IF NOT EXISTS relations_from_idx ON entity_relations(from_entity_id)' },
  { table: 'entity_relations', name: 'relations_to_idx', sql: 'CREATE INDEX IF NOT EXISTS relations_to_idx ON entity_relations(to_entity_id)' },
  { table: 'entity_relations', name: 'relations_type_idx', sql: 'CREATE INDEX IF NOT EXISTS relations_type_idx ON entity_relations(type)' },
  { table: 'session_summaries', name: 'session_summaries_conversation_idx', sql: 'CREATE INDEX IF NOT EXISTS session_summaries_conversation_idx ON session_summaries(conversation_id)' },
  { table: 'session_summaries', name: 'session_summaries_project_idx', sql: 'CREATE INDEX IF NOT EXISTS session_summaries_project_idx ON session_summaries(project_id)' },
  { table: 'beliefs', name: 'beliefs_project_idx', sql: 'CREATE INDEX IF NOT EXISTS beliefs_project_idx ON beliefs(project_id)' },
  { table: 'beliefs', name: 'beliefs_type_idx', sql: 'CREATE INDEX IF NOT EXISTS beliefs_type_idx ON beliefs(belief_type)' },
  { table: 'belief_edges', name: 'belief_edges_from_idx', sql: 'CREATE INDEX IF NOT EXISTS belief_edges_from_idx ON belief_edges(from_belief_id)' },
  { table: 'belief_edges', name: 'belief_edges_to_idx', sql: 'CREATE INDEX IF NOT EXISTS belief_edges_to_idx ON belief_edges(to_belief_id)' },
  { table: 'memory_associations', name: 'associations_graph_traversal_idx', sql: 'CREATE INDEX IF NOT EXISTS associations_graph_traversal_idx ON memory_associations(from_memory_id, to_memory_id, weight, association_type)' },
  { table: 'maintenance_jobs', name: 'maintenance_jobs_name_idx', sql: 'CREATE INDEX IF NOT EXISTS maintenance_jobs_name_idx ON maintenance_jobs(job_name)' },
  { table: 'maintenance_jobs', name: 'maintenance_jobs_next_run_idx', sql: 'CREATE INDEX IF NOT EXISTS maintenance_jobs_next_run_idx ON maintenance_jobs(next_run_at)' },
  { table: 'core_memory', name: 'core_memory_project_idx', sql: 'CREATE INDEX IF NOT EXISTS core_memory_project_idx ON core_memory(project_id)' },
  { table: 'context_sessions', name: 'context_sessions_session_idx', sql: 'CREATE INDEX IF NOT EXISTS context_sessions_session_idx ON context_sessions(session_id)' },
  { table: 'namespaces', name: 'namespaces_project_idx', sql: 'CREATE INDEX IF NOT EXISTS namespaces_project_idx ON namespaces(project_id)' },
  { table: 'place_rules', name: 'place_rules_project_idx', sql: 'CREATE INDEX IF NOT EXISTS place_rules_project_idx ON place_rules(project_id)' },
  { table: 'projects', name: 'projects_path_idx', sql: 'CREATE INDEX IF NOT EXISTS projects_path_idx ON projects(path)' },
] as const;

/**
 * Critical columns that must exist on existing tables.
 * Used by probeSchemaHealth() to detect column-level drift.
 * When these are missing, squish doctor --fix will trigger migration.
 */
const REQUIRED_COLUMNS: Array<{ table: string; column: string }> = [
  { table: 'memories', column: 'primary_place' },
  { table: 'memories', column: 'memory_type' },
];

export type SchemaProbeStatus = 'ok' | 'drifted' | 'unavailable';

export interface SchemaProbeResult {
  status: SchemaProbeStatus;
  backend: string;
  dataDir?: string;
  dbPath?: string;
  detail: string;
  remediation: string | null;
  missingTables: string[];
  missingColumns: Array<{ table: string; column: string }>;
}

export interface CheckResult {
  name: string;
  status: 'ok' | 'degraded' | 'broken';
  message: string;
}

export interface RepairAction {
  type: 'create_table' | 'create_index' | 'add_column' | 'repair_fts' | 'init_places' | 'create_entities_table' | 'run_migration' | 'rebuild_schema';
  detail: string;
  target?: string;
}

export interface FixOptions {
  fixMissingTables?: boolean;
  fixMissingIndexes?: boolean;
  fixFts?: boolean;
  fixPlaces?: boolean;
  fixGraphEntities?: boolean;
  fixAll?: boolean;
  verbose?: boolean;
}

export class SchemaDriftError extends Error {
  readonly probe: SchemaProbeResult;

  constructor(probe: SchemaProbeResult) {
    super(formatSchemaProbeMessage(probe));
    this.name = 'SchemaDriftError';
    this.probe = probe;
  }
}

export function getSchemaRemediationCommand(): string {
  return 'squish doctor --migrate';
}

function describeBackend(): string {
  const databaseUrl = process.env.DATABASE_URL || '';
  const supabaseUrl = process.env.SUPABASE_URL || '';
  const neonProjectId = process.env.NEON_PROJECT_ID || '';
  if (supabaseUrl || neonProjectId) return `remote:${config.remoteBackend}`;
  if (databaseUrl.startsWith('postgres')) return `team:${config.teamBackend}`;
  return 'local:sqlite';
}

function getLocalDbPath(): string {
  return path.join(getDataDir(), 'squish.db');
}

function getRawClient(db: any): any {
  return db?.$client ?? db;
}

async function listTablesFromDrizzle(db: any): Promise<string[]> {
  const result = await db.execute(sql`
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
  `);

  const rows = Array.isArray((result as any)?.rows)
    ? (result as any).rows
    : Array.isArray(result)
      ? result
      : [];
  return rows
    .map((row: any) => row.tablename ?? row.table_name ?? row.name)
    .filter((value: unknown): value is string => typeof value === 'string');
}

async function listExistingTables(db: any): Promise<string[]> {
  const raw = getRawClient(db);

  if (raw && typeof raw.prepare === 'function') {
    const rows = raw.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>;
    return rows.map((row) => row.name);
  }

  if (raw && typeof raw.query === 'function') {
    const result = await raw.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public'");
    return Array.isArray(result?.rows) ? result.rows.map((row: any) => row.tablename).filter(Boolean) : [];
  }

  if (db && typeof db.execute === 'function') {
    return listTablesFromDrizzle(db);
  }

  throw new Error('Unable to inspect database schema with the active driver');
}

/**
 * List column names for a given table.
 * For SQLite, uses PRAGMA table_info(). For PostgreSQL, queries information_schema.
 */
async function listTableColumns(db: any, tableName: string): Promise<string[]> {
  const raw = getRawClient(db);

  if (raw && typeof raw.prepare === 'function') {
    const rows = raw.prepare(`PRAGMA table_info("${tableName}")`).all() as Array<{ name: string }>;
    return rows.map((row) => row.name);
  }

  if (raw && typeof raw.query === 'function') {
    const result = await raw.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = $1 AND table_schema = 'public'`,
      [tableName]
    );
    return Array.isArray(result?.rows) ? result.rows.map((row: any) => row.column_name).filter(Boolean) : [];
  }

  return [];
}

export function formatSchemaProbeMessage(probe: SchemaProbeResult): string {
  const location = probe.dbPath
    ? ` (${probe.dbPath})`
    : probe.dataDir
      ? ` (${probe.dataDir})`
      : '';
  const remediation = probe.remediation ? ` Run \`${probe.remediation}\`.` : '';
  return `Schema drift detected for ${probe.backend}${location}: ${probe.detail}.${remediation}`.trim();
}

export function isSchemaDriftError(error: unknown): error is SchemaDriftError {
  return error instanceof SchemaDriftError;
}

function isLocalMode(): boolean {
  const databaseUrl = process.env.DATABASE_URL || '';
  const supabaseUrl = process.env.SUPABASE_URL || '';
  const neonProjectId = process.env.NEON_PROJECT_ID || '';
  if (supabaseUrl || neonProjectId) return false;
  if (databaseUrl.startsWith('postgres')) return false;
  return true;
}

export async function probeSchemaHealth(): Promise<SchemaProbeResult> {
  const backend = describeBackend();
  const remediation = getSchemaRemediationCommand();

  if (isLocalMode()) {
    const dbPath = getLocalDbPath();
    if (!fs.existsSync(dbPath)) {
      return {
        status: 'ok',
        backend,
        dataDir: getDataDir(),
        dbPath,
        detail: 'Local database has not been created yet',
        remediation: null,
        missingTables: [],
        missingColumns: [],
      };
    }
  }

  let db: any;
  try {
    db = await getDb();
  } catch (error) {
    return {
      status: 'unavailable',
      backend,
      dataDir: getDataDir(),
      dbPath: isLocalMode() ? getLocalDbPath() : undefined,
      detail: error instanceof Error ? error.message : 'Database initialization failed',
      remediation,
      missingTables: [],
      missingColumns: [],
    };
  }

  try {
    const existingTables = await listExistingTables(db);
    const missingTables = REQUIRED_TABLES.filter((table) => !existingTables.includes(table));

    if (missingTables.length > 0) {
      return {
        status: 'drifted',
        backend,
        dataDir: getDataDir(),
        dbPath: isLocalMode() ? getLocalDbPath() : undefined,
        detail: `Missing required tables: ${missingTables.join(', ')}`,
        remediation,
        missingTables: [...missingTables],
        missingColumns: [],
      };
    }

    // Check for missing columns on existing tables (column-level drift)
    const missingColumns: Array<{ table: string; column: string }> = [];
    for (const req of REQUIRED_COLUMNS) {
      if (existingTables.includes(req.table)) {
        const columns = await listTableColumns(db, req.table);
        if (!columns.includes(req.column)) {
          missingColumns.push({ table: req.table, column: req.column });
        }
      }
    }

    if (missingColumns.length > 0) {
      const desc = missingColumns.map((c) => `${c.table}.${c.column}`).join(', ');
      return {
        status: 'drifted',
        backend,
        dataDir: getDataDir(),
        dbPath: isLocalMode() ? getLocalDbPath() : undefined,
        detail: `Missing required columns: ${desc}`,
        remediation,
        missingTables: [],
        missingColumns,
      };
    }

    return {
      status: 'ok',
      backend,
      dataDir: getDataDir(),
      dbPath: isLocalMode() ? getLocalDbPath() : undefined,
      detail: `Schema ready with ${existingTables.length} tables`,
      remediation: null,
      missingTables: [],
      missingColumns: [],
    };
  } catch (error) {
    return {
      status: 'unavailable',
      backend,
      dataDir: getDataDir(),
      dbPath: isLocalMode() ? getLocalDbPath() : undefined,
      detail: error instanceof Error ? error.message : 'Schema inspection failed',
      remediation,
      missingTables: [],
      missingColumns: [],
    };
  }
}

export async function assertSchemaReady(): Promise<void> {
  const probe = await probeSchemaHealth();
  if (probe.status === 'drifted') {
    throw new SchemaDriftError(probe);
  }
}

/**
 * Check if the entity_relations table exists
 */
export async function checkGraphEntitiesTable(): Promise<CheckResult> {
  try {
    const db = await getDb();
    const raw = getRawClient(db);

    if (raw && typeof raw.prepare === 'function') {
      const table = raw.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='entity_relations'").get() as { name: string } | undefined;
      if (!table) {
        return { name: 'graph entities table', status: 'degraded', message: 'entity_relations table is missing (needs schema migration)' };
      }
      // Check entities table too
      const entitiesTable = raw.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='entities'").get() as { name: string } | undefined;
      if (!entitiesTable) {
        return { name: 'graph entities table', status: 'degraded', message: 'entities table is missing' };
      }
      return { name: 'graph entities table', status: 'ok', message: 'entities and entity_relations tables exist' };
    }

    // Fallback for non-sqlite
    if (raw && typeof raw.query === 'function') {
      const result = await raw.query("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename IN ('entity_relations','entities')");
      const tables = (result?.rows ?? []).map((r: any) => r.tablename);
      if (!tables.includes('entity_relations')) {
        return { name: 'graph entities table', status: 'degraded', message: 'entity_relations table is missing (needs schema migration)' };
      }
      return { name: 'graph entities table', status: 'ok', message: 'entities and entity_relations tables exist' };
    }

    return { name: 'graph entities table', status: 'degraded', message: 'Cannot inspect graph entities - unsupported database driver' };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { name: 'graph entities table', status: 'degraded', message: `Cannot check graph entities: ${msg}` };
  }
}

/**
 * Check if the 7 default places have been initialized
 */
export async function checkPlacesInitialization(): Promise<CheckResult> {
  try {
    const db = await getDb();
    const raw = getRawClient(db);

    if (raw && typeof raw.prepare === 'function') {
      // Check if places table exists
      const placesTable = raw.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='places'").get() as { name: string } | undefined;
      if (!placesTable) {
        return { name: 'places initialization', status: 'degraded', message: 'places table does not exist (needs schema migration)' };
      }

      const count = raw.prepare('SELECT COUNT(*) as count FROM places').get() as { count: number };
      if (count.count === 0) {
        return { name: 'places initialization', status: 'degraded', message: 'No places have been initialized yet' };
      }
      if (count.count < 7) {
        return { name: 'places initialization', status: 'degraded', message: `Only ${count.count}/7 default places exist` };
      }
      return { name: 'places initialization', status: 'ok', message: `All 7 default places initialized (${count.count} total)` };
    }

    return { name: 'places initialization', status: 'degraded', message: 'Cannot inspect places - unsupported database driver' };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { name: 'places initialization', status: 'degraded', message: `Cannot check places: ${msg}` };
  }
}

/**
 * Check if consolidation state (geometry tables) are ready
 */
export async function checkConsolidationState(result?: CheckResult): Promise<CheckResult> {
  try {
    const db = await getDb();
    const raw = getRawClient(db);

    if (raw && typeof raw.prepare === 'function') {
      // Check that key tables for consolidation exist
      const requiredForConsolidation = ['memories', 'memory_associations'];
      const missing: string[] = [];
      for (const tableName of requiredForConsolidation) {
        const table = raw.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(tableName) as { name: string } | undefined;
        if (!table) missing.push(tableName);
      }

      if (missing.length > 0) {
        return { name: 'consolidation state', status: 'degraded', message: `Consolidation tables missing: ${missing.join(', ')}` };
      }

      // Check for geometry-related FTS capabilities
      const ftsTable = raw.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='memories_fts'").get() as { name: string } | undefined;
      const ftsStatus = ftsTable ? 'FTS available' : 'FTS not available for consolidation';

      return { name: 'consolidation state', status: 'ok', message: `Consolidation pipeline ready (${ftsStatus})` };
    }

    return { name: 'consolidation state', status: 'degraded', message: 'Cannot check consolidation state - unsupported database driver' };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { name: 'consolidation state', status: 'degraded', message: `Cannot check consolidation state: ${msg}` };
  }
}

/**
 * Check if memory_versions table exists (if versioning is used)
 */
export async function checkMemoryVersionsTable(): Promise<CheckResult> {
  try {
    const db = await getDb();
    const raw = getRawClient(db);

    if (raw && typeof raw.prepare === 'function') {
      const table = raw.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='memory_versions'").get() as { name: string } | undefined;
      if (!table) {
        // Versioning is optional; memories table itself has version column
        return { name: 'memory versions table', status: 'ok', message: 'Memory versioning uses built-in version column in memories table' };
      }
      return { name: 'memory versions table', status: 'ok', message: 'memory_versions table exists' };
    }

    return { name: 'memory versions table', status: 'ok', message: 'Cannot inspect - assuming ok for non-sqlite' };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { name: 'memory versions table', status: 'degraded', message: `Cannot check memory versions: ${msg}` };
  }
}

/**
 * Auto-repair detected schema issues.
 * Returns list of repair actions taken.
 */
export async function fixSchemaIssues(options: FixOptions = {}): Promise<RepairAction[]> {
  const actions: RepairAction[] = [];
  const fixAll = options.fixAll ?? false;
  const verbose = options.verbose ?? true;

  // Resolve which fixes to run
  const fixMissingTables = options.fixMissingTables ?? fixAll;
  const fixMissingIndexes = options.fixMissingIndexes ?? fixAll;
  const fixFts = options.fixFts ?? fixAll;
  const fixPlaces = options.fixPlaces ?? fixAll;
  const fixGraphEntities = options.fixGraphEntities ?? fixAll;

  try {
    const probe = await probeSchemaHealth();

    // Skip if database is unavailable (not just drifted)
    if (probe.status === 'unavailable') {
      if (verbose) console.error('Database unavailable - cannot fix schema');
      return actions;
    }

    const db = await getDb();
    const raw = getRawClient(db);

    if (!raw || (typeof raw.prepare !== 'function' && typeof raw.query !== 'function')) {
      if (verbose) console.error('Unsupported database driver for repair');
      return actions;
    }

    const isSqlite = typeof raw.prepare === 'function';

    // 1. Fix missing tables by running full schema bootstrap
    if (fixMissingTables && probe.missingTables.length > 0) {
      if (verbose) console.log(`Running schema migration to create missing tables (${probe.missingTables.length} missing)...`);
      try {
        if (isSqlite) {
          // Run ensureSqliteSchema which handles both creation and migrations.
          // The second (non-tolerant) pass may throw on existing tables with
          // incomplete column sets, but the first pass already created new tables.
          await ensureSqliteSchema(raw).catch(() => {
            // Second pass failure is acceptable - tables from first pass committed
            if (verbose) console.log('  Schema bootstrap completed with deferred warnings (tables created)');
          });
        } else if (typeof raw.query === 'function') {
          await ensurePostgresSchema(raw);
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        if (verbose) console.warn(`  First-pass schema bootstrap warning: ${msg}`);
      }

      // Check if any tables are still missing after the bootstrap
      const recheck = await probeSchemaHealth();
      if (recheck.missingTables.length > 0 && isSqlite) {
        // Create remaining missing tables individually (they were after the
        // failing statement in the schema SQL)
        for (const tableName of recheck.missingTables) {
          try {
            createSingleTable(raw, tableName);
            actions.push({ type: 'create_table', detail: `Created table ${tableName}` });
            if (verbose) console.log(`  Created table: ${tableName}`);
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            actions.push({ type: 'create_table', detail: `Failed to create ${tableName}: ${msg}` });
            if (verbose) console.warn(`  Could not create table ${tableName}: ${msg}`);
          }
        }
      } else if (recheck.missingTables.length === 0) {
        const allMissing = probe.missingTables.join(', ');
        actions.push({ type: 'run_migration', detail: `Created missing tables: ${allMissing}` });
      }
    }

    // 1b. Fix missing columns by running schema migrations (column-level drift)
    if (fixMissingTables && probe.missingColumns.length > 0) {
      const colDesc = probe.missingColumns.map((c) => `${c.table}.${c.column}`).join(', ');
      if (verbose) console.log(`Running schema migration to add missing columns (${colDesc})...`);
      try {
        if (isSqlite) {
          await ensureSqliteSchema(raw).catch(() => {
            if (verbose) console.log('  Column migration completed with deferred warnings');
          });
        } else if (typeof raw.query === 'function') {
          await ensurePostgresSchema(raw);
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        if (verbose) console.warn(`  Column migration warning: ${msg}`);
      }

      // Verify columns were added
      const recheck = await probeSchemaHealth();
      if (recheck.missingColumns.length === 0) {
        actions.push({ type: 'add_column', detail: `Added missing columns: ${colDesc}` });
      } else {
        const stillMissing = recheck.missingColumns.map((c) => `${c.table}.${c.column}`).join(', ');
        actions.push({ type: 'add_column', detail: `Some columns still missing after migration: ${stillMissing}` });
        if (verbose) console.warn(`  Still missing columns: ${stillMissing}`);
      }
    }

    // 1c. Run v1.5.0 backfill if columns were just added (backfill memory_places and memory_tags)
    if (actions.some(a => a.type === 'add_column' && a.detail.includes('primary_place'))) {
      try {
        const { backfillV1_5_0 } = await import('./backfill-v1.5.0.js');
        const result = await backfillV1_5_0();
        actions.push({ type: 'run_migration', detail: `Backfilled ${result.memoriesUpdated} memories, ${result.placesCreated} places, ${result.tagsCreated} tags` });
        if (verbose) console.log(`  Backfilled ${result.memoriesUpdated} memories for v1.5.0`);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        if (verbose) console.warn(`  Backfill warning: ${msg}`);
      }
    }

    // 2. Fix missing indexes
    if (fixMissingIndexes && isSqlite) {
      const existingIndexes = raw.prepare("SELECT name FROM sqlite_master WHERE type='index'").all() as Array<{ name: string }>;
      const existingNames = new Set(existingIndexes.map(i => i.name));

      for (const idx of REQUIRED_INDEXES) {
        if (!existingNames.has(idx.name)) {
          try {
            raw.exec(idx.sql);
            actions.push({ type: 'create_index', detail: `Created index ${idx.name} on ${idx.table}`, target: idx.table });
            if (verbose) console.log(`  Created index: ${idx.name}`);
          } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            if (verbose) console.warn(`  Could not create index ${idx.name}: ${msg}`);
          }
        }
      }
    }

    // 3. Fix FTS schema
    if (fixFts && isSqlite) {
      const ftsTable = raw.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='memories_fts'").get() as { name: string } | undefined;
      if (!ftsTable) {
        try {
          // Check if memories table exists first
          const memTable = raw.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='memories'").get() as { name: string } | undefined;
          if (memTable) {
            // Recreate FTS using the same SQL from bootstrap
            raw.exec('DROP TRIGGER IF EXISTS memories_ai');
            raw.exec('DROP TRIGGER IF EXISTS memories_ad');
            raw.exec('DROP TRIGGER IF EXISTS memories_au');

            raw.exec(`
              CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
                content,
                tags,
                summary,
                content='memories',
                content_rowid='rowid'
              );

              CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
                INSERT INTO memories_fts(rowid, content, tags, summary)
                VALUES (new.rowid, new.content, COALESCE(new.tags, ''), COALESCE(new.summary, ''));
              END;

              CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
                INSERT INTO memories_fts(memories_fts, rowid, content, tags, summary)
                VALUES ('delete', old.rowid, old.content, COALESCE(old.tags, ''), COALESCE(old.summary, ''));
              END;

              CREATE TRIGGER IF NOT EXISTS memories_au AFTER UPDATE ON memories BEGIN
                INSERT INTO memories_fts(memories_fts, rowid, content, tags, summary)
                VALUES ('delete', old.rowid, old.content, COALESCE(old.tags, ''), COALESCE(old.summary, ''));
                INSERT INTO memories_fts(rowid, content, tags, summary)
                VALUES (new.rowid, new.content, COALESCE(new.tags, ''), COALESCE(new.summary, ''));
              END;
            `);

            actions.push({ type: 'repair_fts', detail: 'Recreated memories_fts table and triggers' });
            if (verbose) console.log('  Repaired FTS: recreated memories_fts table');
          }
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          if (verbose) console.warn(`  Could not repair FTS: ${msg}`);
        }
      }

      // Also check messages_fts
      const msgFtsTable = raw.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='messages_fts'").get() as { name: string } | undefined;
      if (!msgFtsTable) {
        try {
          const memTable = raw.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='messages'").get() as { name: string } | undefined;
          if (memTable) {
            raw.exec('DROP TRIGGER IF EXISTS messages_ai');
            raw.exec('DROP TRIGGER IF EXISTS messages_ad');
            raw.exec('DROP TRIGGER IF EXISTS messages_au');

            raw.exec(`
              CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
                content,
                content='messages',
                content_rowid='rowid'
              );

              CREATE TRIGGER IF NOT EXISTS messages_ai AFTER INSERT ON messages BEGIN
                INSERT INTO messages_fts(rowid, content)
                VALUES (new.rowid, new.content);
              END;

              CREATE TRIGGER IF NOT EXISTS messages_ad AFTER DELETE ON messages BEGIN
                INSERT INTO messages_fts(messages_fts, rowid, content)
                VALUES ('delete', old.rowid, old.content);
              END;

              CREATE TRIGGER IF NOT EXISTS messages_au AFTER UPDATE ON messages BEGIN
                INSERT INTO messages_fts(messages_fts, rowid, content)
                VALUES ('delete', old.rowid, old.content);
                INSERT INTO messages_fts(rowid, content)
                VALUES (new.rowid, new.content);
              END;
            `);

            actions.push({ type: 'repair_fts', detail: 'Recreated messages_fts table and triggers' });
            if (verbose) console.log('  Repaired FTS: recreated messages_fts table');
          }
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          if (verbose) console.warn(`  Could not repair messages FTS: ${msg}`);
        }
      }
    }

    // 4. Initialize default places if missing
    if (fixPlaces && isSqlite) {
      const placesTable = raw.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='places'").get() as { name: string } | undefined;
      if (placesTable) {
        const count = raw.prepare('SELECT COUNT(*) as count FROM places').get() as { count: number };
        if (count.count === 0) {
          try {
            // Use dynamic import to avoid circular dependency
            const { initializeDefaultPlaces } = await import('../core/places/places.js');
            await initializeDefaultPlaces();
            actions.push({ type: 'init_places', detail: 'Initialized 7 default places' });
            if (verbose) console.log('  Initialized 7 default places');
          } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            actions.push({ type: 'init_places', detail: `Failed to initialize places: ${msg}` });
            if (verbose) console.warn(`  Could not initialize places: ${msg}`);
          }
        } else if (count.count < 7) {
          try {
            const { initializeDefaultPlaces } = await import('../core/places/places.js');
            const created = await initializeDefaultPlaces();
            actions.push({ type: 'init_places', detail: `Initialized remaining ${created.length} places` });
            if (verbose) console.log(`  Initialized remaining ${created.length} places`);
          } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            if (verbose) console.warn(`  Could not initialize remaining places: ${msg}`);
          }
        }
      }
    }

    // 5. Fix graph entity tables if missing
    if (fixGraphEntities && isSqlite) {
      const entityRelationsTable = raw.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='entity_relations'").get() as { name: string } | undefined;
      if (!entityRelationsTable) {
        try {
          // entities table should already exist if schema was bootstrapped
          raw.exec(`
            CREATE TABLE IF NOT EXISTS entity_relations (
              id TEXT PRIMARY KEY,
              from_entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
              to_entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
              type TEXT NOT NULL,
              weight INTEGER DEFAULT 1,
              properties TEXT,
              created_at INTEGER DEFAULT (strftime('%s','now')) NOT NULL
            );
          `);
          raw.exec('CREATE INDEX IF NOT EXISTS relations_from_idx ON entity_relations(from_entity_id)');
          raw.exec('CREATE INDEX IF NOT EXISTS relations_to_idx ON entity_relations(to_entity_id)');
          raw.exec('CREATE INDEX IF NOT EXISTS relations_type_idx ON entity_relations(type)');

          actions.push({ type: 'create_entities_table', detail: 'Created entity_relations table and indexes' });
          if (verbose) console.log('  Created entity_relations table');
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          actions.push({ type: 'create_entities_table', detail: `Failed: ${msg}` });
          if (verbose) console.warn(`  Could not create entity_relations: ${msg}`);
        }
      }
    }

    // Re-probe and emit summary
    const recheck = await probeSchemaHealth();
    if (actions.length > 0 && verbose) {
      const statusIcon = recheck.status === 'ok' ? 'OK' : 'ISSUES REMAINING';
      console.log(`\nSchema health after fix: ${statusIcon}`);
      if (recheck.status !== 'ok' && recheck.detail) {
        console.log(`  ${recheck.detail}`);
      }
    }

    return actions;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (verbose) console.error(`Fix failed: ${msg}`);
    return actions;
  }
}

/**
 * Create a single table by name using its full schema definition.
 * Used by fixSchemaIssues to create tables that may have been missed
 * during the bootstrap's tolerant first pass.
 * Only supports tables that appear after the last schema index/trigger
 * statement that could fail on existing tables.
 */
function createSingleTable(raw: any, tableName: string): void {
  switch (tableName) {
    case 'session_summaries':
      raw.exec(`
        CREATE TABLE IF NOT EXISTS session_summaries (
          id TEXT PRIMARY KEY,
          conversation_id TEXT REFERENCES conversations(id) ON DELETE CASCADE NOT NULL,
          project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
          summary_type TEXT NOT NULL,
          content TEXT NOT NULL,
          compressed_from INTEGER,
          tokens_saved INTEGER,
          embedding BLOB,
          created_at INTEGER DEFAULT (strftime('%s','now')) NOT NULL
        );
      `);
      raw.exec('CREATE INDEX IF NOT EXISTS session_summaries_conversation_idx ON session_summaries(conversation_id)');
      raw.exec('CREATE INDEX IF NOT EXISTS session_summaries_project_idx ON session_summaries(project_id)');
      raw.exec('CREATE INDEX IF NOT EXISTS session_summaries_type_idx ON session_summaries(summary_type)');
      raw.exec('CREATE INDEX IF NOT EXISTS session_summaries_created_idx ON session_summaries(created_at)');
      break;

    case 'beliefs':
      raw.exec(`
        CREATE TABLE IF NOT EXISTS beliefs (
          id TEXT PRIMARY KEY,
          project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
          belief_type TEXT NOT NULL,
          statement TEXT NOT NULL,
          normalized_key TEXT NOT NULL,
          confidence REAL DEFAULT 0.5,
          belief_decay_rate INTEGER DEFAULT 30,
          last_confirmed_at INTEGER,
          source_count INTEGER DEFAULT 1,
          status TEXT DEFAULT 'active',
          reason TEXT,
          context TEXT,
          evidence_summary TEXT,
          metadata TEXT,
          created_at INTEGER DEFAULT (strftime('%s','now')) NOT NULL,
          updated_at INTEGER DEFAULT (strftime('%s','now')) NOT NULL,
          UNIQUE(project_id, normalized_key)
        );
      `);
      raw.exec('CREATE INDEX IF NOT EXISTS beliefs_project_idx ON beliefs(project_id)');
      raw.exec('CREATE INDEX IF NOT EXISTS beliefs_type_idx ON beliefs(belief_type)');
      raw.exec('CREATE INDEX IF NOT EXISTS beliefs_status_idx ON beliefs(status)');
      raw.exec('CREATE INDEX IF NOT EXISTS beliefs_confidence_idx ON beliefs(confidence)');
      break;

    case 'belief_memory_sources':
      raw.exec(`
        CREATE TABLE IF NOT EXISTS belief_memory_sources (
          id TEXT PRIMARY KEY,
          belief_id TEXT REFERENCES beliefs(id) ON DELETE CASCADE,
          memory_id TEXT REFERENCES memories(id) ON DELETE CASCADE,
          created_at INTEGER DEFAULT (strftime('%s','now')) NOT NULL,
          UNIQUE(belief_id, memory_id)
        );
      `);
      raw.exec('CREATE INDEX IF NOT EXISTS belief_sources_belief_idx ON belief_memory_sources(belief_id)');
      raw.exec('CREATE INDEX IF NOT EXISTS belief_sources_memory_idx ON belief_memory_sources(memory_id)');
      break;

    case 'belief_edges':
      raw.exec(`
        CREATE TABLE IF NOT EXISTS belief_edges (
          id TEXT PRIMARY KEY,
          from_belief_id TEXT REFERENCES beliefs(id) ON DELETE CASCADE,
          to_belief_id TEXT REFERENCES beliefs(id) ON DELETE CASCADE,
          edge_type TEXT NOT NULL,
          metadata TEXT,
          created_at INTEGER DEFAULT (strftime('%s','now')) NOT NULL,
          UNIQUE(from_belief_id, to_belief_id, edge_type)
        );
      `);
      raw.exec('CREATE INDEX IF NOT EXISTS belief_edges_from_idx ON belief_edges(from_belief_id)');
      raw.exec('CREATE INDEX IF NOT EXISTS belief_edges_to_idx ON belief_edges(to_belief_id)');
      break;

    default:
      throw new Error(`Cannot create unknown table: ${tableName}`);
  }
}
