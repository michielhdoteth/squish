/**
 * Memory Statistics Module
 * Provides memory usage statistics for CLI and MCP
 */

import { getDb } from '../../db/index.js';
import { getSchema } from '../../db/schema.js';
import { config } from '../../config.js';
import { getProjectByPath } from '../../core/projects.js';
import { createDatabaseClient } from '../../core/database.js';

export interface MemoryStats {
  totalMemories: number;
  byType: Record<string, number>;
  oldestMemory?: string;
  newestMemory?: string;
  projectPath: string;
  mode: string;
}

/**
 * Get memory statistics for a project
 */
export async function getMemoryStats(projectPath: string = process.cwd()): Promise<MemoryStats> {
  let db: any;
  try {
    db = createDatabaseClient(await getDb());
  } catch (error) {
    throw new Error(`Database unavailable: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  const schema = await getSchema();
  const project = await getProjectByPath(projectPath);

  const stats: MemoryStats = {
    totalMemories: 0,
    byType: {},
    projectPath,
    mode: config.isTeamMode ? 'team' : 'local'
  };

  try {
    // Count total memories
    const countResult = await db
      .select({ count: schema.memories.id })
      .from(schema.memories)
      .where(project ? eq(schema.memories.projectId, project.id) : undefined);

    stats.totalMemories = countResult.length;

    // Count by type
    if (config.isTeamMode) {
      // PostgreSQL - use raw query for GROUP BY
      const typeCounts = await db.execute(sql`
        SELECT type, COUNT(*) as count
        FROM memories
        ${project ? sql`WHERE project_id = ${project.id}` : sql``}
        GROUP BY type
      `);
      for (const row of typeCounts.rows) {
        stats.byType[row.type] = Number(row.count);
      }
    } else {
      // SQLite - get all and count in memory
      const allMemories = await db
        .select({ type: schema.memories.type })
        .from(schema.memories)
        .where(project ? eq(schema.memories.projectId, project.id) : undefined);

      for (const mem of allMemories) {
        const type = mem.type || 'unknown';
        stats.byType[type] = (stats.byType[type] || 0) + 1;
      }
    }

    // Get oldest and newest
    const oldest = await db
      .select({ createdAt: schema.memories.createdAt })
      .from(schema.memories)
      .where(project ? eq(schema.memories.projectId, project.id) : undefined)
      .orderBy(asc(schema.memories.createdAt))
      .limit(1);

    const newest = await db
      .select({ createdAt: schema.memories.createdAt })
      .from(schema.memories)
      .where(project ? eq(schema.memories.projectId, project.id) : undefined)
      .orderBy(desc(schema.memories.createdAt))
      .limit(1);

    if (oldest.length > 0 && oldest[0].createdAt) {
      stats.oldestMemory = oldest[0].createdAt;
    }
    if (newest.length > 0 && newest[0].createdAt) {
      stats.newestMemory = newest[0].createdAt;
    }

  } catch (error) {
    // Return empty stats on error
    console.error('Error getting memory stats:', error);
  }

  return stats;
}

import { eq, sql, asc, desc } from 'drizzle-orm';
