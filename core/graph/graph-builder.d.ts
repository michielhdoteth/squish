/**
 * Graph Builder
 *
 * Orchestrates the full pipeline: extract entities and relations from
 * memories and store them in the knowledge graph.
 */
export interface GraphBuildStats {
    memoriesProcessed: number;
    entitiesCreated: number;
    relationsCreated: number;
    entitiesDeduplicated: number;
    errors: number;
    durationMs: number;
}
export interface GraphAddStats {
    entitiesCreated: number;
    relationsCreated: number;
    source: 'llm' | 'regex' | 'fallback' | 'none';
}
/**
 * Build or rebuild the entity graph for a project.
 * Processes all memories in the project, extracting entities and relations.
 */
export declare function buildGraphForProject(projectPath: string, options?: {
    clearExisting?: boolean;
    batchSize?: number;
    preferLLM?: boolean;
    deduplicate?: boolean;
}): Promise<GraphBuildStats>;
/**
 * Add a single memory to the knowledge graph.
 * Used for incremental updates when new memories are stored.
 */
export declare function addMemoryToGraph(memoryId: string, options?: {
    preferLLM?: boolean;
}): Promise<GraphAddStats>;
/**
 * Get graph statistics for a project.
 */
export declare function getGraphStats(projectPath: string): Promise<{
    entityCount: number;
    relationCount: number;
    relationTypes: Record<string, number>;
    avgConnections: number;
}>;
//# sourceMappingURL=graph-builder.d.ts.map