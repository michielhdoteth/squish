import { createDb } from './adapter.js';
import { config } from '../config.js';

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
    // Try a simple query on any table
    const tables = Object.values(database._.schema || {});
    if (tables.length > 0) {
      await (database as any).select().from(tables[0]).limit(1);
    }
    return true;
  } catch (error: any) {
    // Check if it's a known database unavailability issue
    if (error.message?.includes('not a valid Win32 application') ||
        error.message?.includes('Database unavailable')) {
      return false; // Graceful degradation - database unavailable but not an error
    }
    console.error('Database health check failed:', error);
    return false;
  }
}

export { config };
export { createDb };
