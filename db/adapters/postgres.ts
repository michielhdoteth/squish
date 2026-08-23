/**
 * PostgreSQL adapter for team mode.
 *
 * Exports a synchronous `createPgDb()` that returns a Drizzle ORM instance
 * backed by a `pg` Pool.  The Pool connects lazily (on first query), so the
 * function itself never awaits — matching the call-site in `db/index.ts`.
 */

import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { config } from '../../config.js';
import { logger } from '../../core/logger.js';
import * as schema from '../drizzle/schema-pg.js';

/**
 * Create a Drizzle database instance connected to PostgreSQL.
 *
 * Reads the connection string from `SQUISH_DATABASE_URL` (via `config.databaseUrl`).
 * Returns synchronously — the underlying `pg` Pool connects lazily on first query.
 */
export function createPgDb() {
  const url = config.databaseUrl;

  if (!url) {
    throw new Error(
      'SQUISH_DATABASE_URL is required for team mode. ' +
        'Set it to a PostgreSQL connection string (e.g. postgres://user:pass@host:5432/dbname).'
    );
  }

  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch {
    hostname = '(invalid URL)';
  }

  const pool = new Pool({
    connectionString: url,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });

  pool.on('error', (err) => {
    logger.error('Unexpected PostgreSQL pool error', { error: err.message });
  });

  const db = drizzle(pool, { schema });

  logger.info('PostgreSQL pool created (team mode)', { host: hostname });

  return db;
}
