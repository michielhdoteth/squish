/**
 * Graph Pipeline
 *
 * Orchestration layer that connects the knowledge graph extraction components.
 * Wraps extraction, storage, and deduplication into a unified pipeline with
 * progress tracking, error recovery, and stats aggregation.
 */
export interface PipelineOptions {
    clearExisting?: boolean;
    batchSize?: number;
    preferLLM?: boolean;
    deduplicate?: boolean;
    maxMemories?: number;
    onProgress?: (progress: PipelineProgress) => void;
}
export interface PipelineProgress {
    phase: 'extract' | 'store' | 'dedup' | 'done';
    processed: number;
    total: number;
    entitiesCreated: number;
    relationsCreated: number;
}
export interface PipelineStats {
    memoriesProcessed: number;
    entitiesCreated: number;
    relationsCreated: number;
    entitiesDeduplicated: number;
    errors: number;
    durationMs: number;
    extractionSource: 'llm' | 'regex' | 'mixed';
}
export interface PipelineResult {
    memoryId: string;
    entitiesCreated: number;
    relationsCreated: number;
    source: 'llm' | 'regex' | 'none';
    durationMs: number;
}
export interface ProjectPipelineStats {
    entityCount: number;
    relationCount: number;
    relationTypes: Record<string, number>;
    avgConnections: number;
    lastPipelineAt: Date | null;
}
/**
 * Process all project memories through the knowledge graph pipeline.
 *
 * Pipeline stages:
 *   1. Extract entities and relations from each memory
 *   2. Store extracted data in the knowledge graph
 *   3. Deduplicate entities
 *   4. Compute pipeline stats
 *   5. Emit enrichment hints (auto-export if configured)
 */
export declare function buildProjectGraph(projectPath: string, options?: PipelineOptions): Promise<PipelineStats>;
/**
 * Process a single memory through the knowledge graph pipeline.
 * Used for incremental updates when new memories are stored.
 */
export declare function buildMemoryGraph(memoryId: string, options?: {
    preferLLM?: boolean;
}): Promise<PipelineResult>;
/**
 * Get knowledge graph statistics for a project, augmented with
 * the last pipeline timestamp if available.
 */
export declare function getGraphPipelineStats(projectPath: string): Promise<ProjectPipelineStats>;
//# sourceMappingURL=pipeline.d.ts.map