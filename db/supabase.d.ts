/**
 * Supabase client wrapper that returns a Drizzle PostgreSQL client.
 * Supabase uses the standard Postgres wire protocol, so we can reuse the same
 * drizzle-node-postgres driver as the regular Postgres backend.
 */
export declare function createSupabaseClient(): Promise<import("drizzle-orm/node-postgres").NodePgDatabase<typeof import("./drizzle/schema.js")> & {
    $client: import("pg").Pool;
}>;
//# sourceMappingURL=supabase.d.ts.map