/**
 * Migration Generator - Creates migrations from schema definitions
 *
 * This utility generates ALTER TABLE statements from schema column definitions,
 * eliminating the need for inline column arrays in migration files.
 */
import type { Database } from 'better-sqlite3';
export interface ColumnDefinition {
    type: string;
    primary?: boolean;
    references?: string;
    default?: string;
    notNull?: boolean;
}
export interface IndexDefinition {
    name: string;
    columns: string[];
    using?: string;
    unique?: boolean;
}
export interface TableSchema {
    name: string;
    columns: Record<string, ColumnDefinition>;
    indexes?: IndexDefinition[];
}
/**
 * Generate and run column migrations for a table schema
 */
export declare function migrateTable(sqlite: Database, schema: TableSchema): Promise<void>;
/**
 * Generate and run index migrations
 */
export declare function migrateIndexes(sqlite: Database, tableName: string, indexes: IndexDefinition[]): Promise<void>;
/**
 * Run all table migrations from schema list
 */
export declare function runAllSchemaMigrations(sqlite: Database, schemas: TableSchema[]): Promise<void>;
//# sourceMappingURL=generator.d.ts.map