/**
 * Summarization Queries
 * Database operations for summary retrieval
 */

import { eq, desc } from 'drizzle-orm';
import { getDb } from '../../db/index.js';
import { getSchema } from '../../db/schema.js';

/**
 * Get recent summaries for a conversation
 */
export async function getRecentSummaries(
  conversationId: string,
  limit: number = 10
): Promise<any[]> {
  try {
    const db = await getDb();
    const schema = await getSchema();

    return await (db as any)
      .select()
      .from(schema.sessionSummaries)
      .where(eq(schema.sessionSummaries.conversationId, conversationId))
      .orderBy(desc(schema.sessionSummaries.createdAt))
      .limit(limit);
  } catch (error) {
    console.error('[squish] Error getting recent summaries:', error);
    return [];
  }
}