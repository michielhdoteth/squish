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
const dbErrors = new Map<string, string>();

function getDbCacheKey(): string {
  return process.env.SQUISH_DATA_DIR || '';
}

export async function getDb() {
  const cacheKey = getDbCacheKey();

  const cachedError = dbErrors.get(cacheKey);
  if (cachedError) {
    throw new Error(cachedError);
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
      dbErrors.set(cacheKey, dbError);
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
