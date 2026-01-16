/**
 * MCP Tool: detect_duplicate_memories
 *
 * Scans for duplicate or similar memories and creates merge proposals
 * Entry point for the memory merging workflow
 */
interface DetectDuplicatesInput {
    projectId?: string;
    threshold?: number;
    memoryType?: 'fact' | 'preference' | 'decision' | 'observation' | 'context';
    limit?: number;
    autoCreateProposals?: boolean;
}
interface DetectDuplicatesResponse {
    ok: boolean;
    message: string;
    data?: {
        projectId: string;
        duplicateCount: number;
        proposalsCreated: number;
        proposalIds: string[];
        statistics: {
            totalMemories: number;
            scannedMemories: number;
            candidatesFound: number;
            estimatedTokensSaved: number;
        };
        timing: {
            stage1Ms: number;
            stage2Ms: number;
            totalMs: number;
        };
    };
    error?: string;
}
/**
 * Handle detect_duplicate_memories tool call
 *
 * Algorithm:
 * 1. Run two-stage detection (SimHash → embedding similarity)
 * 2. Filter by safety checks
 * 3. Create merge proposals in database
 * 4. Return summary
 */
export declare function handleDetectDuplicates(input: DetectDuplicatesInput): Promise<DetectDuplicatesResponse>;
export {};
//# sourceMappingURL=detect-duplicates.d.ts.map