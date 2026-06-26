export declare function createDb(): Promise<(import("drizzle-orm/neon-http").NeonHttpDatabase<Record<string, never>> & {
    $client: import("@neondatabase/serverless").NeonQueryFunction<false, false>;
}) | (import("drizzle-orm/node-postgres").NodePgDatabase<typeof import("./drizzle/schema.js")> & {
    $client: import("pg").Pool;
}) | (import("drizzle-orm/better-sqlite3").BetterSQLite3Database<typeof import("./drizzle/schema-sqlite.js")> & {
    $client: import("better-sqlite3").Database;
}) | import("drizzle-orm/sql-js").SQLJsDatabase<typeof import("./drizzle/schema-sqlite.js")>>;
export default createDb;
//# sourceMappingURL=adapter.d.ts.map