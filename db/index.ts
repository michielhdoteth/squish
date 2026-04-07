import { createDb } from './adapter.js';
import { config } from '../config.js';
import { logger } from '../core/logger.js';
import { isDatabaseUnavailableError } from '../core/lib/utils.js';

let db: Awaited<ReturnType<typeof createDb>> | null = null;
let dbError: string | null = null;

export async function getDb() {
  if (dbError) {
    throw new Error(dbError);
  }

if (!db) {
      try {
        if (config.supabaseUrl && config.supabaseKey) {
          const { createSupabaseClient } = await import('./supabase.js');
          db = await createSupabaseClient();
        } else {
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
