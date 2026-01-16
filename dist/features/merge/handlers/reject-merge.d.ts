/**
 * MCP Tool: reject_merge
 *
 * Rejects a merge proposal without executing it
 */
interface RejectMergeInput {
    proposalId: string;
    reviewNotes?: string;
}
interface RejectMergeResponse {
    ok: boolean;
    message: string;
    data?: {
        proposalId: string;
        previousStatus: string;
        newStatus: string;
        rejectedAt: string;
    };
    error?: string;
}
/**
 * Handle reject_merge tool call
 *
 * Marks a merge proposal as rejected without executing it
 */
export declare function handleRejectMerge(input: RejectMergeInput): Promise<RejectMergeResponse>;
export {};
//# sourceMappingURL=reject-merge.d.ts.map