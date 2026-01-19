/**
 * Reverses/undoes a completed merge and restores original memories.
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
export declare function handleReverseMerge(input: ReverseMergeInput): Promise<ReverseMergeResponse>;
export {};
//# sourceMappingURL=reverse-merge.d.ts.map