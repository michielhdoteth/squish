/**
 * Summarization Queries
 * Database operations for summary retrieval
 */
import { eq, desc } from 'drizzle-orm';
import { getDb } from '../../db/index.js';
import { getSchema } from '../../db/schema.js';
<<<<<<< HEAD
import { logger } from '../logger.js';
=======
>>>>>>> pr-3-branch
/**
 * Get recent summaries for a conversation
 */
export async function getRecentSummaries(conversationId, limit = 10) {
    try {
        const db = await getDb();
        const schema = await getSchema();
        return await db
            .select()
            .from(schema.sessionSummaries)
            .where(eq(schema.sessionSummaries.conversationId, conversationId))
            .orderBy(desc(schema.sessionSummaries.createdAt))
            .limit(limit);
    }
    catch (error) {
<<<<<<< HEAD
        logger.error('Error getting recent summaries', error);
=======
        console.error('[squish] Error getting recent summaries:', error);
>>>>>>> pr-3-branch
        return [];
    }
}
//# sourceMappingURL=queries.js.map