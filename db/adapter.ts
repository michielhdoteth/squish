import { config, getDataDir } from '../config.js';
import { ensurePostgresSchema, ensureSqliteSchema } from './bootstrap.js';
import { logger } from '../core/logger.js';

async function createBunSqliteDb(dbPath: string) {
  // @ts-ignore - bun:sqlite module not found in types but works at runtime
  const { drizzle } = await import('drizzle-orm/bun-sqlite');
  const schemaModule = await import('../drizzle/schema-sqlite.js');

  // Bun SQLite doesn't need file path for in-memory, but we'll use file path for persistence
  // @ts-ignore - bun:sqlite module not found in types but works at runtime
  const sqlite = new (await import('bun:sqlite')).default(dbPath);

  // Enable foreign keys
  sqlite.exec('PRAGMA foreign_keys = ON');

  await ensureSqliteSchema(sqlite);

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

  // Try bun:sqlite first (Bun's built-in SQLite)
  try {
    return await createBunSqliteDb(dbPath);
  } catch (bunSqliteError: any) {
    logger.warn('bun:sqlite failed, trying better-sqlite3', { 
      error: bunSqliteError.message 
    });
    
    // Try better-sqlite3 second (best performance)
    try {
      return await createBetterSqliteDb(dbPath);
    } catch (betterSqliteError: any) {
      logger.warn('better-sqlite3 failed, trying sql.js fallback', { 
        error: betterSqliteError.message 
      });
      
      // Fallback to sql.js (pure JavaScript, no native module)
      try {
        return await createSqlJsDb(dbPath);
      } catch (sqlJsError: any) {
        // All failed - this is critical, Squish cannot work without DB
        logger.error('CRITICAL: SQLite database initialization failed', {
          bunSqliteError: bunSqliteError.message,
          betterSqliteError: betterSqliteError.message,
          sqlJsError: sqlJsError.message
        });
        
        throw new Error(
          `Squish requires SQLite to function. Database initialization failed.\n` +
          `Primary error (bun:sqlite): ${bunSqliteError.message}\n` +
          `Secondary error (better-sqlite3): ${betterSqliteError.message}\n` +
          `Fallback error (sql.js): ${sqlJsError.message}\n\n` +
          `Solutions:\n` +
          `1. Install build tools: npm install -g windows-build-tools (Windows)\n` +
          `2. Or use PostgreSQL instead by setting DATABASE_URL environment variable`
        );
      }
    }
  }
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

  logger.info('SQLite initialized with better-sqlite3');
  return drizzle(sqlite, { schema: schemaModule });
}

async function createSqlJsDb(dbPath: string) {
  // @ts-ignore - sql.js has no types but works fine
  const initSqlJs = await import('sql.js');
  const { drizzle } = await import('drizzle-orm/sql-js');
  const schemaModule = await import('../drizzle/schema-sqlite.js');
  const fs = await import('fs');
  const path = await import('path');

  const SQL = await initSqlJs.default();
  
  let data: Uint8Array | undefined;
  
  // Try to load existing database
  if (fs.existsSync(dbPath)) {
    data = fs.readFileSync(dbPath);
  }
  
  const sqlite = new SQL.Database(data);
  
  // Enable foreign keys
  sqlite.exec('PRAGMA foreign_keys = ON');
  
  // Schema bootstrap
  await ensureSqliteSchema(sqlite);
  
  // Persist database on changes (sql.js is in-memory by default)
  const originalExec = sqlite.exec.bind(sqlite);
  sqlite.exec = function(...args: any[]) {
    const result = originalExec(...args);
    // Save after each exec
    const data = sqlite.export();
    fs.writeFileSync(dbPath, Buffer.from(data));
    return result;
  };
  
  // Add prepare method for compatibility with drizzle-orm/sql-js
  sqlite.prepare = (query: string) => {
    const stmt = sqlite.prepare(query);
    const preparedStatement: any = {};
    
    preparedStatement.bind = (bindParams: any[]) => {
      bindParams.forEach((param, index) => {
        stmt.bind(param, index + 1);
      });
      return preparedStatement;
    };
    
    preparedStatement.step = () => {
      return stmt.step();
    };
    
    preparedStatement.getAsObject = () => {
      return stmt.getAsObject();
    };
    
    preparedStatement.free = () => {
      stmt.free();
    };
    
    preparedStatement.run = () => {
      const result = stmt.step() ? { changes: sqlite.changes() } : { changes: 0 };
      stmt.reset();
      return result;
    };
    
    preparedStatement.get = (bindParams: any[] = []) => {
      if (bindParams.length > 0) {
        preparedStatement.bind(bindParams);
      }
      const row = stmt.step() ? stmt.getAsObject() : undefined;
      stmt.reset();
      return row;
    };
    
    preparedStatement.all = (bindParams: any[] = []) => {
      if (bindParams.length > 0) {
        preparedStatement.bind(bindParams);
      }
      const rows = [];
      while (stmt.step()) {
        rows.push(stmt.getAsObject());
      }
      stmt.reset();
      return rows;
    };
    
    return preparedStatement;
  };
  
  logger.info('SQLite initialized with sql.js (pure JavaScript fallback)');
  return drizzle(sqlite, { schema: schemaModule });
}

export default createDb;
