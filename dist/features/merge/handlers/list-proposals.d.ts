/**
 * MCP Tool: list_merge_proposals
 *
 * Lists pending merge proposals for user review
 */
interface ListProposalsInput {
    projectId: string;
    status?: 'pending' | 'approved' | 'rejected' | 'expired';
    limit?: number;
}
interface ProposalSummary {
    id: string;
    projectId: string;
    sourceMemoryIds: string[];
    status: 'pending' | 'approved' | 'rejected' | 'expired';
    confidenceLevel: 'high' | 'medium' | 'low';
    similarityScore: number;
    mergeReason: string;
    createdAt: string;
    conflictWarnings: string[];
}
interface ListProposalsResponse {
    ok: boolean;
    message: string;
    data?: {
        projectId: string;
        count: number;
        proposals: ProposalSummary[];
        byStatus: {
            pending: number;
            approved: number;
            rejected: number;
            expired: number;
        };
    };
    error?: string;
}
/**
 * Handle list_merge_proposals tool call
 *
 * Lists merge proposals that are waiting for user review
 */
export declare function handleListProposals(input: ListProposalsInput): Promise<ListProposalsResponse>;
export {};
//# sourceMappingURL=list-proposals.d.ts.map