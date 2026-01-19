/**
 * Snapshot Comparison Operations
 * Functions for comparing and diffing snapshots
 */
import { getMemorySnapshot } from './retrieval.js';
import { logger } from '../logger.js';
export function calculateDiff(before, after) {
    const beforeLines = before.split('\n');
    const afterLines = after.split('\n');
    const beforeSet = new Set(beforeLines);
    const afterSet = new Set(afterLines);
    const added = afterLines.filter(line => !beforeSet.has(line));
    const removed = beforeLines.filter(line => !afterSet.has(line));
    return {
        added: added.length > 0 ? added : undefined,
        removed: removed.length > 0 ? removed : undefined,
    };
}
export async function compareSnapshots(snapshotId1, snapshotId2) {
    try {
        const snap1 = await getMemorySnapshot(snapshotId1);
        const snap2 = await getMemorySnapshot(snapshotId2);
        if (!snap1 || !snap2) {
            throw new Error('One or both snapshots not found');
        }
        return {
            diff: calculateDiff(snap1.content, snap2.content),
            contextBefore: snap1.content.substring(0, 200),
            contextAfter: snap2.content.substring(0, 200),
        };
    }
    catch (error) {
        logger.error('Error comparing snapshots', error);
        throw error;
    }
}
//# sourceMappingURL=comparison.js.map