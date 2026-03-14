import { createDb } from './adapter.js';
import { config } from '../config.js';
import { logger } from '../core/logger.js';

let db: Awaited<ReturnType<typeof createDb>> | null = null;
let dbError: string | null = null;

export async function getDb() {
  if (dbError) {
    throw new Error(dbError);
  }

  if (!db) {
    try {
      db = await createDb();
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
    // Try a simple query - use a raw query that's guaranteed to work
    const dbClient = (database as any).$client;
    if (dbClient && typeof dbClient.query === 'function') {
      await dbClient.query('SELECT 1');
    } else if (dbClient && typeof dbClient.prepare === 'function') {
      dbClient.prepare('SELECT 1').get();
    }
    return true;
  } catch (error: any) {
    // Check if it's a known database unavailability issue
    if (error.message?.includes('not a valid Win32 application') ||
        error.message?.includes('Database unavailable')) {
      return false; // Graceful degradation - database unavailable but not an error
    }
    logger.error('Database health check failed', error);
    return false;
  }
}

export { config };
export { createDb };
