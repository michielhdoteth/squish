/**
 * Schema Index - Table schema definitions
 * 
 * DEPRECATED: This module was previously used to aggregate table schemas.
 * Table definitions are now in db/bootstrap.ts for first-time setup
 * and db/schema/*.ts for migration column definitions.
 * 
 * These exports remain for backward compatibility but return empty arrays.
 */

import type { TableSchema } from './generator.js';

// Re-export migration schemas for compatibility
export { memoriesSchema } from './memories.js';
export { learningsSchema } from './learnings.js';
export { beliefsSchema, beliefMemorySourcesSchema, beliefEdgesSchema } from './beliefs.js';
export { strategiesSchema, strategyEdgesSchema, strategyBeliefEdgesSchema, teamMembersSchema } from './strategies.js';

/**
 * Table schemas for migration utilities
 * @deprecated Use db/schema/memories.ts, db/schema/learnings.ts, db/schema/beliefs.ts directly
 */
export const tableSchemas: TableSchema[] = [];

/**
 * Generate complete SQLite schema SQL
 * @deprecated Table definitions moved to db/bootstrap.ts
 */
export function generateSqliteSchema(): string {
  console.warn('DEPRECATED: generateSqliteSchema() - table definitions are in db/bootstrap.ts');
  return '';
}

/**
 * Generate complete PostgreSQL schema SQL
 * @deprecated Table definitions moved to db/bootstrap.ts
 */
export function generatePostgresSchema(): string {
  console.warn('DEPRECATED: generatePostgresSchema() - table definitions are in db/bootstrap.ts');
  return '';
}

/**
 * Get all SQLite table definitions in order
 * @deprecated Table definitions moved to db/bootstrap.ts
 */
export function getAllSqliteTables(): string[] {
  console.warn('DEPRECATED: getAllSqliteTables() - table definitions are in db/bootstrap.ts');
  return [];
}

/**
 * Get all PostgreSQL table definitions in order
 * @deprecated Table definitions moved to db/bootstrap.ts
 */
export function getAllPostgresTables(): string[] {
  console.warn('DEPRECATED: getAllPostgresTables() - table definitions are in db/bootstrap.ts');
  return [];
}
