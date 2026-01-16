/**
 * MCP Tool: list_merge_proposals
 *
 * Lists pending merge proposals for user review
 */
import { getDb } from '../../../db/index.js';
import { getSchema } from '../../../db/schema.js';
import { createDatabaseClient } from '../../../core/database.js';
import { eq, desc } from 'drizzle-orm';
/**
 * Handle list_merge_proposals tool call
 *
 * Lists merge proposals that are waiting for user review
 */
export async function handleListProposals(input) {
    try {
        const { projectId, status, limit = 20 } = input;
        if (!projectId) {
            return {
                ok: false,
                message: 'projectId is required',
                error: 'projectId is required',
            };
        }
        const db = createDatabaseClient(await getDb());
        const schema = await getSchema();
        // Build query
        let query = db
            .select()
            .from(schema.memoryMergeProposals)
            .where(eq(schema.memoryMergeProposals.projectId, projectId));
        // Filter by status if specified
        if (status) {
            query = query.where(eq(schema.memoryMergeProposals.status, status));
        }
        // Order by creation date (newest first)
        query = query.orderBy(desc(schema.memoryMergeProposals.createdAt));
        // Limit results
        query = query.limit(limit);
        const proposals = await query;
        // Count by status for the project
        const allProposals = await db
            .select()
            .from(schema.memoryMergeProposals)
            .where(eq(schema.memoryMergeProposals.projectId, projectId));
        const byStatus = {
            pending: allProposals.filter((p) => p.status === 'pending').length,
            approved: allProposals.filter((p) => p.status === 'approved').length,
            rejected: allProposals.filter((p) => p.status === 'rejected').length,
            expired: allProposals.filter((p) => p.status === 'expired').length,
        };
        // Format proposals
        const formattedProposals = proposals.map((p) => ({
            id: p.id,
            projectId: p.projectId,
            sourceMemoryIds: p.sourceMemoryIds || [],
            status: p.status || 'pending',
            confidenceLevel: p.confidenceLevel || 'medium',
            similarityScore: typeof p.similarityScore === 'string' ? parseFloat(p.similarityScore) : p.similarityScore || 0,
            mergeReason: p.mergeReason || '',
            createdAt: p.createdAt?.toISOString() || '',
            conflictWarnings: p.conflictWarnings || [],
        }));
        return {
            ok: true,
            message: `Found ${formattedProposals.length} proposals (${byStatus.pending} pending)`,
            data: {
                projectId,
                count: formattedProposals.length,
                proposals: formattedProposals,
                byStatus,
            },
        };
    }
    catch (error) {
        return {
            ok: false,
            message: 'Failed to list proposals',
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}
//# sourceMappingURL=list-proposals.js.map