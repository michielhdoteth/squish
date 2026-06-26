import type { Database } from 'better-sqlite3';
import type { Pool } from 'pg';
/**
 * Ensure the data directory exists (.squish folder in project root)
 */
export declare function ensureDataDirectory(): Promise<void>;
export declare function ensureSqliteSchema(sqlite: Database): Promise<void>;
export declare function getSchemaVersion(sqlite: Database): Promise<string | null>;
export declare function runMigrationsForVersion(sqlite: Database, targetVersion: string): Promise<void>;
export declare function ensurePostgresSchema(pool: Pool): Promise<void>;
//# sourceMappingURL=bootstrap.d.ts.map