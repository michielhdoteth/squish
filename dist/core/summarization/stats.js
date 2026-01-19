/**
 * Summarization Statistics
 * Analytics and statistics for summarization operations
 */
import { eq } from 'drizzle-orm';
import { getDb } from '../../db/index.js';
import { getSchema } from '../../db/schema.js';
<<<<<<< HEAD
import { logger } from '../logger.js';
=======
>>>>>>> pr-3-branch
/**
 * Get summarization statistics
 */
export async function getSummarizationStats(projectId) {
    try {
        const db = await getDb();
        const schema = await getSchema();
        const where = projectId ? eq(schema.sessionSummaries.projectId, projectId) : undefined;
        const summaries = await db.select().from(schema.sessionSummaries).where(where);
        const stats = {
            totalSummaries: summaries.length,
            byType: {
                incremental: 0,
                rolling: 0,
                final: 0,
            },
            totalTokensSaved: 0,
            avgCompressionRatio: 0,
        };
        for (const s of summaries) {
            stats.byType[s.summaryType] = (stats.byType[s.summaryType] || 0) + 1;
            stats.totalTokensSaved += s.tokensSaved || 0;
        }
        // Calculate average compression ratio
        let totalRatio = 0;
        for (const s of summaries) {
            if (s.compressedFrom && s.compressedFrom > 0) {
                totalRatio += s.tokensSaved / (s.compressedFrom * 100); // Rough estimate
            }
        }
        stats.avgCompressionRatio = summaries.length > 0 ? totalRatio / summaries.length : 0;
        return stats;
    }
    catch (error) {
<<<<<<< HEAD
        logger.error('Error getting summarization stats', error);
=======
        console.error('[squish] Error getting summarization stats:', error);
>>>>>>> pr-3-branch
        return {
            totalSummaries: 0,
            byType: {},
            totalTokensSaved: 0,
            avgCompressionRatio: 0,
        };
    }
}
//# sourceMappingURL=stats.js.map