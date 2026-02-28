import { config, getDataDir } from '../config.js';
import { ensurePostgresSchema, ensureSqliteSchema } from './bootstrap.js';
import { logger } from '../core/logger.js';

// Runtime detection - check if running in Bun
const isBun = typeof (globalThis as any).Bun !== 'undefined';

export async function createDb() {
  if (config.isTeamMode) {
    return createPostgresDb();
  } else {
    return createSqliteDb();
  }
}

async function createPostgresDb() {
  const { Pool } = await import('pg');
  const { drizzle } = await import('drizzle-orm/node-postgres');
  const schemaModule = await import('../drizzle/schema.js');

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 20,
  });

  await ensurePostgresSchema(pool);

  return drizzle(pool, { schema: schemaModule });
}

async function createSqliteDb() {
  const dbPath = `${getDataDir()}/squish.db`;

  // Try Bun's built-in SQLite first if running in Bun
  if (isBun) {
    try {
      return await createBunSqliteDb(dbPath);
    } catch (error) {
      logger.warn('Bun SQLite failed, trying better-sqlite3 fallback', { error: String(error) });
    }
  }

  // Fallback to better-sqlite3 for Node.js
  try {
    return await createBetterSqliteDb(dbPath);
  } catch (error) {
    logger.error('SQLite initialization failed', error);
    throw new Error(`SQLite database unavailable: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

async function createBunSqliteDb(dbPath: string): Promise<any> {
  // Dynamic import for Bun runtime - wrapped to avoid TS issues
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore - bun:sqlite is only available in Bun runtime
  const { Database } = await import('bun:sqlite');
  const { drizzle } = await import('drizzle-orm/bun-sqlite');
  const schemaModule = await import('../drizzle/schema-sqlite.js');

  const sqlite = new Database(dbPath);

  // Enable foreign keys
  sqlite.run('PRAGMA foreign_keys = ON');

  // Run schema bootstrap
  ensureSqliteSchemaForBun(sqlite);

  return drizzle(sqlite, { schema: schemaModule });
}

async function createBetterSqliteDb(dbPath: string) {
  const DatabaseModule = await import('better-sqlite3');
  const Database = DatabaseModule.default;
  const { drizzle } = await import('drizzle-orm/better-sqlite3');
  const schemaModule = await import('../drizzle/schema-sqlite.js');

  const sqlite = new Database(dbPath);

  // Enable foreign keys
  sqlite.pragma('foreign_keys = ON');

  await ensureSqliteSchema(sqlite);

  return drizzle(sqlite, { schema: schemaModule });
}

// Bun-specific schema bootstrap
function ensureSqliteSchemaForBun(sqlite: any) {
  const createMemoriesTable = `
    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY,
      project_id TEXT,
      type TEXT NOT NULL DEFAULT 'observation',
      content TEXT NOT NULL,
      summary TEXT,
      tags TEXT,
      metadata TEXT,
      embedding BLOB,
      embedding_json TEXT,
      source TEXT DEFAULT 'mcp',
      tier TEXT DEFAULT 'warm',
      status TEXT DEFAULT 'active',
      importance_score REAL DEFAULT 50,
      relevance_score REAL,
      coactivation_score INTEGER DEFAULT 0,
      access_count INTEGER DEFAULT 0,
      retrieval_count INTEGER DEFAULT 0,
      echo_count INTEGER DEFAULT 0,
      fizzle_count INTEGER DEFAULT 0,
      is_pinned INTEGER DEFAULT 0,
      is_protected INTEGER DEFAULT 0,
      is_immutable INTEGER DEFAULT 0,
      is_mergeable INTEGER DEFAULT 0,
      is_merged INTEGER DEFAULT 0,
      merged_into TEXT,
      merged_at TEXT,
      superseded_by TEXT,
      superseded_at TEXT,
      valid_from TEXT,
      valid_to TEXT,
      expired_at TEXT,
      last_accessed_at TEXT,
      last_retrieved_at TEXT,
      last_echoed_at TEXT,
      last_importance_recalc TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `;

  const createProjectsTable = `
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      path TEXT UNIQUE,
      description TEXT,
      metadata TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `;

  const createAssociationsTable = `
    CREATE TABLE IF NOT EXISTS memory_associations (
      id TEXT PRIMARY KEY,
      from_memory_id TEXT NOT NULL,
      to_memory_id TEXT NOT NULL,
      association_type TEXT NOT NULL,
      weight REAL DEFAULT 1,
      coactivation_count INTEGER DEFAULT 1,
      last_coactivated_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(from_memory_id, to_memory_id)
    )
  `;

  sqlite.run(createMemoriesTable);
  sqlite.run(createProjectsTable);
  sqlite.run(createAssociationsTable);

  // FTS is optional - don't fail if it doesn't work
  try {
    sqlite.run(`
      CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
        content,
        summary,
        content='memories',
        content_rowid='rowid'
      )
    `);
  } catch (e: any) {
    logger.debug('FTS5 table creation skipped', { error: e?.message || String(e) });
  }

  logger.info('SQLite schema initialized (Bun runtime)');
}
