/**
 * Beliefs table migrations
 * Uses schema definitions to generate migrations
 *
 * For existing databases without beliefs table (pre-v1.2.0), creates the table.
 * Then runs column migrations for all belief-related tables.
 */
import type { Database } from 'better-sqlite3';
export declare function runBeliefMigrations(sqlite: Database): Promise<void>;
//# sourceMappingURL=beliefs.d.ts.map