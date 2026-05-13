import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config, getDataDir } from '../config.js';
import { ensurePostgresSchema, ensureSqliteSchema } from './bootstrap.js';
import { logger } from '../core/logger.js';

const SQL_JS_WASM_RELATIVE_PATH = '../vendor/sql.js/sql-wasm.wasm';

function isBunRuntime(): boolean {
  return typeof (globalThis as { Bun?: unknown }).Bun !== 'undefined';
}

function formatInitializationError(label: string, error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return `${label}: ${message}`;
}

function shouldPersistSql(query: string): boolean {
  return /^\s*(insert|update|delete|create|alter|drop|replace|pragma|begin|commit|rollback|vacuum|reindex)\b/i.test(query);
}

function persistSqlJsDatabase(sqlite: { export: () => Uint8Array }, dbPath: string) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  fs.writeFileSync(dbPath, Buffer.from(sqlite.export()));
}

function resolveSqlJsWasmPath(): string {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(currentDir, SQL_JS_WASM_RELATIVE_PATH),
    path.resolve(currentDir, '../../node_modules/sql.js/dist/sql-wasm.wasm'),
    path.resolve(process.cwd(), 'node_modules/sql.js/dist/sql-wasm.wasm'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    `sql.js wasm asset not found. Looked in: ${candidates.join(', ')}`
  );
}

function wrapSqlJsStatement(stmt: any, sqlite: any, dbPath: string, query: string) {
  const persistAfterRun = shouldPersistSql(query);

  if (persistAfterRun && typeof stmt.run === 'function') {
    const originalRun = stmt.run.bind(stmt);
    stmt.run = (...args: any[]) => {
      const result = originalRun(...args);
      persistSqlJsDatabase(sqlite, dbPath);
      return result;
    };
  }

  return stmt;
}

async function createBunSqliteDb(dbPath: string) {
  // @ts-ignore - bun:sqlite module not found in types but works at runtime
  const { drizzle } = await import('drizzle-orm/bun-sqlite');
  const schemaModule = await import('./drizzle/schema-sqlite.js');

  // Bun SQLite doesn't need file path for in-memory, but we'll use file path for persistence
  // @ts-ignore - bun:sqlite module not found in types but works at runtime
  const sqlite = new (await import('bun:sqlite')).default(dbPath);

  // Enable foreign keys
  sqlite.exec('PRAGMA foreign_keys = ON');

  if (!fs.existsSync(dbPath) || sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().length === 0) {
    await ensureSqliteSchema(sqlite);
  }

  logger.info('SQLite initialized with bun:sqlite');
  return drizzle(sqlite, { schema: schemaModule });
}

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
  const schemaModule = await import('./drizzle/schema.js');

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 20,
  });

  return drizzle(pool, { schema: schemaModule });
}

async function createSqliteDb() {
  const dbPath = `${getDataDir()}/squish.db`;
  const errors: string[] = [];

  if (isBunRuntime()) {
    try {
      return await createBunSqliteDb(dbPath);
    } catch (error) {
      errors.push(formatInitializationError('bun:sqlite', error));
      if (process.env.DEBUG === 'true') {
        logger.warn('bun:sqlite failed, trying Node-compatible drivers', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  try {
    return await createBetterSqliteDb(dbPath);
  } catch (error) {
    errors.push(formatInitializationError('better-sqlite3', error));
    if (process.env.DEBUG === 'true') {
      logger.warn('better-sqlite3 failed, trying sql.js fallback', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  try {
    return await createSqlJsDb(dbPath);
  } catch (error) {
    errors.push(formatInitializationError('sql.js', error));
  }

  logger.error('CRITICAL: SQLite database initialization failed', { errors });
  throw new Error(
    'Squish requires a working local SQLite driver. Initialization failed.\n' +
      errors.map((entry, index) => `${index + 1}. ${entry}`).join('\n')
  );
}

async function createBetterSqliteDb(dbPath: string) {
  const shouldBootstrapSchema = !fs.existsSync(dbPath);
  const DatabaseModule = await import('better-sqlite3');
  const Database = DatabaseModule.default;
  const { drizzle } = await import('drizzle-orm/better-sqlite3');
  const schemaModule = await import('./drizzle/schema-sqlite.js');

  const sqlite = new Database(dbPath);

  // Enable foreign keys
  sqlite.pragma('foreign_keys = ON');

  const tableCount = sqlite.prepare("SELECT COUNT(*) as count FROM sqlite_master WHERE type='table'").get() as { count?: number };
  if (shouldBootstrapSchema || Number(tableCount?.count ?? 0) === 0) {
    await ensureSqliteSchema(sqlite);
  }

  logger.info('SQLite initialized with better-sqlite3');
  return drizzle(sqlite, { schema: schemaModule });
}

async function createSqlJsDb(dbPath: string) {
  // @ts-ignore - sql.js has no types but works fine
  const initSqlJs = await import('sql.js');
  const { drizzle } = await import('drizzle-orm/sql-js');
  const schemaModule = await import('./drizzle/schema-sqlite.js');
  const wasmPath = resolveSqlJsWasmPath();
  const SQL = await initSqlJs.default({
    locateFile: (file: string) => (file.endsWith('.wasm') ? wasmPath : file),
  });

  let data: Uint8Array | undefined;

  const hadFile = fs.existsSync(dbPath);
  if (hadFile) {
    data = fs.readFileSync(dbPath);
  }

  const sqlite: any = new SQL.Database(data);
  sqlite.exec('PRAGMA foreign_keys = ON');
  const tableCount = Array.isArray(sqlite.exec("SELECT COUNT(*) as count FROM sqlite_master WHERE type='table'"))
    ? Number(sqlite.exec("SELECT COUNT(*) as count FROM sqlite_master WHERE type='table'")[0]?.values?.[0]?.[0] ?? 0)
    : 0;
  if (!hadFile || tableCount === 0) {
    await ensureSqliteSchema(sqlite);
  }

  persistSqlJsDatabase(sqlite, dbPath);

  const originalExec = sqlite.exec.bind(sqlite);
  sqlite.exec = (...args: any[]) => {
    const [query] = args;
    const result = originalExec(...args);
    if (typeof query === 'string' && shouldPersistSql(query)) {
      persistSqlJsDatabase(sqlite, dbPath);
    }
    return result;
  };

  if (typeof sqlite.run === 'function') {
    const originalRun = sqlite.run.bind(sqlite);
    sqlite.run = (...args: any[]) => {
      const [query] = args;
      const result = originalRun(...args);
      if (typeof query === 'string' && shouldPersistSql(query)) {
        persistSqlJsDatabase(sqlite, dbPath);
      }
      return result;
    };
  }

  const originalPrepare = sqlite.prepare.bind(sqlite);
  sqlite.prepare = (query: string, ...args: any[]) => {
    const stmt = originalPrepare(query, ...args);
    return wrapSqlJsStatement(stmt, sqlite, dbPath, query);
  };

  logger.info('SQLite initialized with sql.js (pure JavaScript fallback)');
  return drizzle(sqlite, { schema: schemaModule });
}

export default createDb;
