import { createDb } from './adapter.js';
import { config } from '../config.js';
import { getDataDir } from '../config.js';
import { logger } from '../core/logger.js';
import { isDatabaseUnavailableError } from '../core/lib/utils.js';
import { clearSchemaCache } from './schema.js';

// Use any for db to avoid type conflicts between different drivers
// The actual type will be determined at runtime based on mode
let db: any = null;
let dbError: string | null = null;
let lastDataDir: string | null = null;

/**
 * Detect the current mode dynamically from process.env instead of using
 * the cached config values. This is critical for tests that set env vars
 * after config.ts has already been imported (ES module import hoisting).
 */
function detectCurrentMode(): 'local' | 'team' | 'remote' {
  const databaseUrl = process.env.DATABASE_URL || '';
  const supabaseUrl = process.env.SUPABASE_URL || '';
  const neonProjectId = process.env.NEON_PROJECT_ID || '';

  if (supabaseUrl || neonProjectId) return 'remote';
  if (databaseUrl.startsWith('postgres')) return 'team';
  return 'local';
}

export async function getDb() {
  if (dbError) {
    throw new Error(dbError);
  }

  // If SQUISH_DATA_DIR changed since last db creation, invalidate the cached db
  // so a fresh connection is created for the new data directory.
  const currentDataDir = process.env.SQUISH_DATA_DIR || null;
  if (db && lastDataDir !== currentDataDir) {
    db = null;
    lastDataDir = null;
    dbError = null;
  }

  if (!db) {
    try {
      // Detect mode dynamically from current env vars (not cached config)
      const currentMode = detectCurrentMode();
      const remoteBackend = process.env.SQUISH_REMOTE_BACKEND || config.remoteBackend;
      const teamBackend = process.env.SQUISH_TEAM_BACKEND || config.teamBackend;
      const supabaseUrl = process.env.SUPABASE_URL || config.supabaseUrl;
      const supabaseKey = process.env.SUPABASE_SERVICE_KEY || config.supabaseKey;
      const neonProjectId = process.env.NEON_PROJECT_ID || config.neonProjectId;
      const neonServiceKey = process.env.NEON_SERVICE_KEY || config.neonServiceKey;

      // Priority: remote (user's Supabase/Neon) > team (PostgreSQL) > local (SQLite)
      if (currentMode === 'remote') {
        if (remoteBackend === 'neon' && neonProjectId && neonServiceKey) {
          const { createNeonClient } = await import('./neon.js');
          db = await createNeonClient();
        } else if (supabaseUrl && supabaseKey) {
          const { createSupabaseClient } = await import('./supabase.js');
          db = await createSupabaseClient();
        } else {
          throw new Error('Remote backend not configured (need SUPABASE_URL or NEON_PROJECT_ID)');
        }
      } else if (currentMode === 'team') {
        // Team mode: PostgreSQL (or Supabase/Neon if explicitly configured)
        if (teamBackend === 'supabase' && supabaseUrl && supabaseKey) {
          const { createSupabaseClient } = await import('./supabase.js');
          db = await createSupabaseClient();
        } else if (teamBackend === 'neon' && neonProjectId && neonServiceKey) {
          const { createNeonClient } = await import('./neon.js');
          db = await createNeonClient();
        } else {
          db = await createDb();
        }
      } else {
        // Local mode: SQLite
        db = await createDb();
      }
      lastDataDir = process.env.SQUISH_DATA_DIR || null;
    } catch (error) {
      dbError = error instanceof Error ? error.message : 'Database initialization failed';
      throw new Error(dbError);
    }
  }

  // Safety: never return null/undefined
  if (!db) {
    throw new Error('Database initialization returned null. Ensure SQUISH_DATA_DIR is set and the database driver is available.');
  }

  return db;
}

export function resetDb(): void {
  db = null;
  dbError = null;
  lastDataDir = null;
  // Clear schema cache so it re-resolves for the new db
  clearSchemaCache();
}

export async function checkDatabaseHealth(): Promise<boolean> {
  try {
    const database = await getDb();

    const dbClient = (database as any).$client ?? database;
    if (dbClient && typeof dbClient.query === 'function') {
      await dbClient.query('SELECT 1');
    } else if (dbClient && typeof dbClient.exec === 'function') {
      dbClient.exec('SELECT 1');
    } else if (dbClient && typeof dbClient.prepare === 'function') {
      const statement = dbClient.prepare('SELECT 1');
      if (typeof statement.get === 'function') {
        statement.get();
      } else if (typeof statement.step === 'function') {
        statement.step();
      }
      if (typeof statement.free === 'function') {
        statement.free();
      }
    }
    return true;
  } catch (error: any) {
    if (isDatabaseUnavailableError(error)) {
      return false;
    }
    logger.error('Database health check failed', error);
    return false;
  }
}

export { config };
export { createDb };
