/**
 * MCP Tool: reverse_merge
 *
 * Reverses/undoes a completed merge and restores original memories
 *
 * This is critical for ensuring merges are reversible
 */
import { getDb } from '../../../db/index.js';
import { getSchema } from '../../../db/schema.js';
import { createDatabaseClient } from '../../../core/database.js';
import { eq } from 'drizzle-orm';
/**
 * Handle reverse_merge tool call
 *
 * Reversal workflow:
 * 1. Load merge history record
 * 2. Load canonical memory
 * 3. Restore original memories from sourceMemoriesSnapshot
 * 4. Mark canonical memory as inactive
 * 5. Clear isMerged flags on restored memories
 * 6. Update history record: isReversed=true
 * 7. Return success
 */
export async function handleReverseMerge(input) {
    try {
        const { mergeHistoryId, reason } = input;
        if (!mergeHistoryId) {
            return {
                ok: false,
                message: 'mergeHistoryId is required',
                error: 'mergeHistoryId is required',
            };
        }
        const db = createDatabaseClient(await getDb());
        const schema = await getSchema();
        // Step 1: Load merge history record
        const [history] = await db
            .select()
            .from(schema.memoryMergeHistory)
            .where(eq(schema.memoryMergeHistory.id, mergeHistoryId));
        if (!history) {
            return {
                ok: false,
                message: 'Merge history record not found',
                error: `Merge history ${mergeHistoryId} not found`,
            };
        }
        // Check if already reversed
        if (history.isReversed) {
            return {
                ok: false,
                message: 'Merge already reversed',
                error: 'This merge has already been reversed',
            };
        }
        // Step 2: Load and mark canonical memory as inactive
        const [canonicalMemory] = await db
            .select()
            .from(schema.memories)
            .where(eq(schema.memories.id, history.canonicalMemoryId));
        if (!canonicalMemory) {
            return {
                ok: false,
                message: 'Canonical memory not found',
                error: `Canonical memory ${history.canonicalMemoryId} not found`,
            };
        }
        const now = new Date();
        // Step 3: Restore source memories from snapshot
        const sourceSnapshot = history.sourceMemoriesSnapshot || [];
        const sourceMemoryIds = history.sourceMemoryIds || [];
        if (sourceSnapshot.length === 0) {
            return {
                ok: false,
                message: 'No snapshot data to restore from',
                error: 'Merge history has no source memories snapshot',
            };
        }
        // Restore each memory from snapshot
        for (const snapshotData of sourceSnapshot) {
            const memoryId = snapshotData.id;
            // Load current state of the memory (should be marked as merged)
            const [currentMemory] = await db
                .select()
                .from(schema.memories)
                .where(eq(schema.memories.id, memoryId));
            if (currentMemory) {
                // Restore to original state
                await db
                    .update(schema.memories)
                    .set({
                    isMerged: false,
                    mergedIntoId: null,
                    mergedAt: null,
                    isActive: true,
                    updatedAt: now,
                })
                    .where(eq(schema.memories.id, memoryId));
            }
        }
        // Step 4: Deactivate canonical memory
        await db
            .update(schema.memories)
            .set({
            isActive: false,
            updatedAt: now,
        })
            .where(eq(schema.memories.id, history.canonicalMemoryId));
        // Step 5: Update merge history record
        await db
            .update(schema.memoryMergeHistory)
            .set({
            isReversed: true,
            reversedAt: now,
            reversedBy: canonicalMemory.userId,
        })
            .where(eq(schema.memoryMergeHistory.id, mergeHistoryId));
        return {
            ok: true,
            message: `Merge reversed successfully. Restored ${sourceMemoryIds.length} memories`,
            data: {
                mergeHistoryId,
                canonicalMemoryId: history.canonicalMemoryId,
                restoredMemoryIds: sourceMemoryIds,
                reversedAt: now.toISOString(),
            },
        };
    }
    catch (error) {
        return {
            ok: false,
            message: 'Failed to reverse merge',
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}
//# sourceMappingURL=reverse-merge.js.map