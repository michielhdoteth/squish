import { createDb } from './adapter.js';
import { config } from '../config.js';
import { logger } from '../core/logger.js';
import { isDatabaseUnavailableError } from '../core/lib/utils.js';

// Use any for db to avoid type conflicts between different drivers
// The actual type will be determined at runtime based on mode
let db: any = null;
let dbError: string | null = null;

export async function getDb() {
  if (dbError) {
    throw new Error(dbError);
  }

if (!db) {
      try {
        // Priority: remote (user's Supabase/Neon) > team (PostgreSQL) > local (SQLite)
        if (config.isRemoteMode) {
          if (config.remoteBackend === 'neon' && config.neonProjectId && config.neonServiceKey) {
            const { createNeonClient } = await import('./neon.js');
            db = await createNeonClient();
          } else if (config.supabaseUrl && config.supabaseKey) {
            const { createSupabaseClient } = await import('./supabase.js');
            db = await createSupabaseClient();
          } else {
            throw new Error('Remote backend not configured (need SUPABASE_URL or NEON_PROJECT_ID)');
          }
        } else if (config.isTeamMode) {
          // Team mode: PostgreSQL (or Supabase/Neon if explicitly configured)
          if (config.teamBackend === 'supabase' && config.supabaseUrl && config.supabaseKey) {
            const { createSupabaseClient } = await import('./supabase.js');
            db = await createSupabaseClient();
          } else if (config.teamBackend === 'neon' && config.neonProjectId && config.neonServiceKey) {
            const { createNeonClient } = await import('./neon.js');
            db = await createNeonClient();
          } else {
            db = await createDb();
          }
        } else {
          // Local mode: SQLite
          db = await createDb();
        }
      } catch (error) {
        dbError = error instanceof Error ? error.message : 'Database initialization failed';
        throw new Error(dbError);
      }
    }
  return db;
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
export { getDb };
