/**
 * MCP Tool: approve_merge
 *
 * CRITICAL HANDLER: Executes the approved merge
 * This handler must be bulletproof and atomically handle all operations
 */
interface ApproveMergeInput {
    proposalId: string;
    reviewNotes?: string;
}
interface ApproveMergeResponse {
    ok: boolean;
    message: string;
    data?: {
        proposalId: string;
        canonicalMemoryId: string;
        mergedMemoryIds: string[];
        tokensSaved: number;
        mergedAt: string;
    };
    error?: string;
}
/**
 * Handle approve_merge tool call
 *
 * Merge workflow (all within single transaction):
 * 1. Load proposal and source memories
 * 2. Merge memories using type-specific strategy
 * 3. Create canonical memory with merged content
 * 4. Mark source memories as merged (soft delete)
 * 5. Create merge history record with full snapshot
 * 6. Update proposal status to approved
 * 7. Return result
 */
export declare function handleApproveMerge(input: ApproveMergeInput): Promise<ApproveMergeResponse>;
export {};
//# sourceMappingURL=approve-merge.d.ts.map