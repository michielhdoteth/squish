export type SchemaModule = typeof import('../drizzle/schema.js') | typeof import('../drizzle/schema-sqlite.js');
export declare function getSchema(): Promise<SchemaModule>;
//# sourceMappingURL=schema.d.ts.map