export declare function createDb(): Promise<(import("drizzle-orm/node-postgres").NodePgDatabase<typeof import("../drizzle/schema.js")> & {
    $client: import("pg").Pool;
}) | (import("drizzle-orm/better-sqlite3").BetterSQLite3Database<typeof import("../drizzle/schema-sqlite.js")> & {
    $client: import("better-sqlite3").Database;
})>;
//# sourceMappingURL=adapter.d.ts.map