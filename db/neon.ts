import { config } from '../config.js';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';

/**
 * Neon client wrapper that returns a Drizzle HTTP client.
 * Neon HTTP driver is faster for single non-interactive transactions.
 */
export async function createNeonClient() {
  if (!config.neonProjectId || !config.neonServiceKey) {
    throw new Error('Neon configuration missing (NEON_PROJECT_ID or NEON_SERVICE_KEY)');
  }

  // Neon HTTP driver - use DATABASE_URL with Neon connection string
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL required for Neon connection');
  }

  const sql = neon(connectionString);
  return drizzle(sql);
}
