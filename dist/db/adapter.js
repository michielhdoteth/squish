import { config, getDataDir } from '../config.js';
import { ensurePostgresSchema, ensureSqliteSchema } from './bootstrap.js';
export async function createDb() {
    if (config.isTeamMode) {
        // PostgreSQL mode
        return createPostgresDb();
    }
    else {
        // SQLite mode
        return createSqliteDb();
    }
}
async function createPostgresDb() {
    const { Pool } = await import('pg');
    const { drizzle } = await import('drizzle-orm/node-postgres');
    const schemaModule = await import('../drizzle/schema.js');
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        max: 20,
    });
    await ensurePostgresSchema(pool);
    return drizzle(pool, { schema: schemaModule });
}
async function createSqliteDb() {
    try {
        const DatabaseModule = await import('better-sqlite3');
        const Database = DatabaseModule.default;
        const { drizzle } = await import('drizzle-orm/better-sqlite3');
        const schemaModule = await import('../drizzle/schema-sqlite.js');
        const dbPath = `${getDataDir()}/squish.db`;
        const sqlite = new Database(dbPath);
        // Enable foreign keys
        sqlite.pragma('foreign_keys = ON');
        await ensureSqliteSchema(sqlite);
        return drizzle(sqlite, { schema: schemaModule });
    }
    catch (error) {
        console.error('[squish] SQLite initialization failed:', error);
        throw new Error(`SQLite database unavailable: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}
//# sourceMappingURL=adapter.js.map