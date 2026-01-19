/**
 * Snapshot Cleanup Operations
 * Maintenance and cleanup for snapshot data
 */
import { cleanupOldMemorySnapshots } from '../utils/cleanup-operations.js';
/**
 * Delete old snapshots
 */
export async function deleteOldSnapshots(olderThanDays = 90) {
    return cleanupOldMemorySnapshots(olderThanDays);
}
//# sourceMappingURL=cleanup.js.map