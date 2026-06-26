/**
 * Neon client wrapper that returns a Drizzle HTTP client.
 * Neon HTTP driver is faster for single non-interactive transactions.
 */
export declare function createNeonClient(): Promise<import("drizzle-orm/neon-http").NeonHttpDatabase<Record<string, never>> & {
    $client: import("@neondatabase/serverless").NeonQueryFunction<false, false>;
}>;
//# sourceMappingURL=neon.d.ts.map