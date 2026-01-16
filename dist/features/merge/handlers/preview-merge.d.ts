/**
 * MCP Tool: preview_merge
 *
 * Shows a preview of what the merged result will look like
 * without actually executing the merge
 */
interface PreviewMergeInput {
    proposalId: string;
}
interface PreviewMergeResponse {
    ok: boolean;
    message: string;
    data?: {
        proposalId: string;
        sourceMemories: Array<{
            id: string;
            type: string;
            content: string;
            summary: string | null;
            tags: string[];
            createdAt: string;
        }>;
        mergedResult: {
            content: string;
            summary: string | null;
            tags: string[];
            metadata: Record<string, unknown>;
        };
        analysis: {
            mergeReason: string;
            conflictWarnings: string[];
            savedTokens: number;
            savedPercentage: number;
            similarityScore: number;
            confidenceLevel: string;
        };
    };
    error?: string;
}
/**
 * Handle preview_merge tool call
 *
 * Shows side-by-side comparison and merged result
 */
export declare function handlePreviewMerge(input: PreviewMergeInput): Promise<PreviewMergeResponse>;
export {};
//# sourceMappingURL=preview-merge.d.ts.map