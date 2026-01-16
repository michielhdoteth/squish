import { createDb } from './adapter.js';
import { config } from '../config.js';
export declare function getDb(): Promise<(import("drizzle-orm/node-postgres").NodePgDatabase<typeof import("../drizzle/schema.js")> & {
    $client: import("pg").Pool;
}) | (import("drizzle-orm/better-sqlite3").BetterSQLite3Database<typeof import("../drizzle/schema-sqlite.js")> & {
    $client: import("better-sqlite3").Database;
})>;
export declare function checkDatabaseHealth(): Promise<boolean>;
export { config };
export { createDb };
//# sourceMappingURL=index.d.ts.map