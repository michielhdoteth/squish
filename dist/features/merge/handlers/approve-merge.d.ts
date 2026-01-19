/**
 * Executes the approved merge in a single atomic transaction.
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
export declare function handleApproveMerge(input: ApproveMergeInput): Promise<ApproveMergeResponse>;
export {};
//# sourceMappingURL=approve-merge.d.ts.map