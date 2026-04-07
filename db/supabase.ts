import { config } from '../config.js';
import { drizzle } from 'drizzle-orm/node-postgres';

/**
 * Supabase client wrapper that returns a Drizzle PostgreSQL client.
 * Supabase uses the standard Postgres wire protocol, so we can reuse the same
 * drizzle-node-postgres driver as the regular Postgres backend.
 */
export async function createSupabaseClient() {
  if (!config.supabaseUrl || !config.supabaseKey) {
    throw new Error('Supabase configuration missing (SUPABASE_URL or SUPABASE_SERVICE_KEY)');
  }

  const { Pool } = await import('pg');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 20,
  });

  // Dynamically import the schema module to avoid circular dependencies.
  const schemaModule = await import('./drizzle/schema.js');
  return drizzle(pool, { schema: schemaModule });
}
