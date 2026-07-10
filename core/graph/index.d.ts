/**
 * Knowledge Graph Module
 *
 * Provides entity extraction, relationship mapping, graph traversal,
 * and multi-hop retrieval for Squish's knowledge graph.
 */
export { extractEntitiesAndRelations, batchExtractEntitiesAndRelations } from './llm-entity-extractor.js';
export type { LLMExtractionResult, ExtractedRelation, RelationType } from './llm-entity-extractor.js';
export { extractAndStoreRelations, getEntityRelations, getProjectEntities, clearProjectGraph } from './relationship-extractor.js';
export type { StoredRelation } from './relationship-extractor.js';
export { deduplicateProjectEntities } from './entity-deduplicator.js';
export type { DeduplicationResult } from './entity-deduplicator.js';
export { traverse, findPaths, getNeighborhood, findEntitiesByName } from './graph-traversal.js';
export type { GraphNode, GraphEdge, TraversalPath, NeighborhoodResult } from './graph-traversal.js';
export { multiHopSearch, needsMultiHop, explainRetrievalPath } from './multi-hop-retrieval.js';
export type { MultiHopResult, MultiHopSearchOptions } from './multi-hop-retrieval.js';
export { buildGraphForProject, addMemoryToGraph, getGraphStats } from './graph-builder.js';
export type { GraphBuildStats, GraphAddStats } from './graph-builder.js';
export { buildProjectGraph, buildMemoryGraph, getGraphPipelineStats } from './pipeline.js';
export type { PipelineStats, PipelineResult, PipelineOptions, PipelineProgress, ProjectPipelineStats } from './pipeline.js';
export { InMemoryGraphBackend } from './backend.js';
export type { GraphBackend, BFSResult } from './backend.js';
//# sourceMappingURL=index.d.ts.map