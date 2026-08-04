import { createDb } from './adapter.js';
import { config } from '../config.js';
import { getDataDir } from '../config.js';
import { logger } from '../core/logger.js';
import { isDatabaseUnavailableError } from '../core/lib/utils.js';
import { clearSchemaCache } from './schema.js';

// Cache database clients per effective runtime environment so parallel tests
// using different data directories or connection strings do not interfere.
const dbInstances = new Map<string, any>();
const dbInitPromises = new Map<string, Promise<any>>();

// Transient error cache: errors expire after 5 minutes so the system can
// recover from transient failures without requiring a manual resetDb() call.
const DB_ERROR_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const dbErrors = new Map<string, { message: string; timestamp: number }>();

function getDbCacheKey(): string {
  return process.env.SQUISH_DATA_DIR || '';
}

export async function getDb() {
  const cacheKey = getDbCacheKey();

  const cachedError = dbErrors.get(cacheKey);
  if (cachedError) {
    // Expire transient errors after TTL so the system can recover
    if (Date.now() - cachedError.timestamp > DB_ERROR_CACHE_TTL_MS) {
      dbErrors.delete(cacheKey);
    } else {
      throw new Error(cachedError.message);
    }
  }

  const cachedDb = dbInstances.get(cacheKey);
  if (cachedDb) {
    return cachedDb;
  }

  const pending = dbInitPromises.get(cacheKey);
  if (pending) {
    return pending;
  }

  const initPromise = (async () => {
    try {
      const createdDb = await createDb();
      dbInstances.set(cacheKey, createdDb);
      return createdDb;
    } catch (error) {
      const dbError = error instanceof Error ? error.message : 'Database initialization failed';
      dbErrors.set(cacheKey, { message: dbError, timestamp: Date.now() });
      throw new Error(dbError);
    } finally {
      dbInitPromises.delete(cacheKey);
    }
  })();

  dbInitPromises.set(cacheKey, initPromise);
  return initPromise;
}

export function resetDb(): void {
  const cacheKey = getDbCacheKey();
  dbInstances.delete(cacheKey);
  dbErrors.delete(cacheKey);
  dbInitPromises.delete(cacheKey);
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
