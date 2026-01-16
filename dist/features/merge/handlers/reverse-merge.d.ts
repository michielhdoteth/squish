/**
 * MCP Tool: reverse_merge
 *
 * Reverses/undoes a completed merge and restores original memories
 *
 * This is critical for ensuring merges are reversible
 */
interface ReverseMergeInput {
    mergeHistoryId: string;
    reason?: string;
}
interface ReverseMergeResponse {
    ok: boolean;
    message: string;
    data?: {
        mergeHistoryId: string;
        canonicalMemoryId: string;
        restoredMemoryIds: string[];
        reversedAt: string;
    };
    error?: string;
}
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
export declare function handleReverseMerge(input: ReverseMergeInput): Promise<ReverseMergeResponse>;
export {};
//# sourceMappingURL=reverse-merge.d.ts.map