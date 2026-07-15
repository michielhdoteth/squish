/**
 * LLM Consolidator
 *
 * Uses LLM to find creative cross-connections across memories that the
 * algorithmic DBSCAN approach would miss. Stores insights as knowledge
 * records and creates edges between related memories.
 *
 * Design principles:
 * - LLM is ALWAYS optional - returns empty results when unavailable
 * - No placeholder content - only real LLM-generated insights
 * - Uses existing knowledge system (createKnowledge + createKnowledgeEdge)
 * - Batched to avoid token limits (max 20 memories per batch)
 */
export interface ConsolidationResult {
    insightsCreated: number;
    edgesCreated: number;
    memoriesProcessed: number;
    errors: string[];
}
/**
 * Run LLM-driven consolidation on recent memories.
 *
 * 1. Fetch unconsolidated memories
 * 2. Send batches to LLM for cross-connection analysis
 * 3. Store insights as knowledge records
 * 4. Create edges between connected memories
 */
export declare function runLLMConsolidation(projectId?: string, options?: {
    maxMemories?: number;
    batchSize?: number;
}): Promise<ConsolidationResult>;
//# sourceMappingURL=llm-consolidator.d.ts.map