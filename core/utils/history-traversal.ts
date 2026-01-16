/**
 * Shared History and Version Tracking Utilities
 * Common patterns for traversing version chains and history
 */

import { eq } from 'drizzle-orm';
import { getDb } from '../../db/index.js';
import { getSchema } from '../../db/schema.js';

/**
 * Traverse superseded fact chain (specific to memories table)
 * Follows the supersededBy chain to build complete version history
 */
export async function traverseSupersededChain(
  startFactId: string,
  options: {
    maxDepth?: number;
    includeStart?: boolean;
  } = {}
): Promise<any[]> {
  const { maxDepth = 50, includeStart = true } = options;

  try {
    const db = await getDb();
    const schema = await getSchema();

    // Get the starting fact
    const initial = await (db as any)
      .select()
      .from(schema.memories)
      .where(eq(schema.memories.id, startFactId))
      .limit(1);

    if (initial.length === 0) {
      return [];
    }

    const history: any[] = includeStart ? [initial[0]] : [];
    let currentId = initial[0].supersededBy;
    let depth = 0;

    // Follow the superseded chain
    while (currentId && depth < maxDepth) {
      const next = await (db as any)
        .select()
        .from(schema.memories)
        .where(eq(schema.memories.id, currentId))
        .limit(1);

      if (next.length === 0) break;

      history.push(next[0]);
      currentId = next[0].supersededBy;
      depth++;
    }

    return history;
  } catch (error) {
    console.error('[squish] Error traversing superseded chain:', error);
    return [];
  }
}