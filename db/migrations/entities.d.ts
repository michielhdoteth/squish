/**
 * Entities table migrations
 * Adds missing columns for graph auto-build (mention_count, last_mentioned_at, aliases)
 * These columns are used by relationship-extractor.ts and entity-deduplicator.ts
 * but were never added to the original schema.
 */
import type { Database } from 'better-sqlite3';
export declare function runEntitiesMigrations(sqlite: Database): Promise<void>;
//# sourceMappingURL=entities.d.ts.map