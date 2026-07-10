/**
 * Query Router Module
 *
 * Classifies query intent and selects optimal retrieval strategy
 * using regex/keyword-based classification (no LLM, < 5ms).
 */
export type QueryIntent = 'temporal' | 'relational' | 'strategic' | 'entity_heavy' | 'factual' | 'exploratory' | 'default';
export type RetrievalStrategy = 'hybrid_search' | 'graph_expanded' | 'multi_hop' | 'temporal_validity' | 'strategy_first' | 'entity_aware' | 'contextual';
export interface QueryClassification {
    intent: QueryIntent;
    confidence: number;
    strategy: RetrievalStrategy;
    reasons: string[];
    detectedEntities: string[];
    detectedTemporalRefs: string[];
    detectedStrategyKeywords: string[];
}
export interface AutoRouteOptions {
    projectId?: string;
    knownEntities?: string[];
    preferGraph?: boolean;
    maxResults?: number;
}
export interface RouteResult {
    classification: QueryClassification;
    recommendedStrategy: RetrievalStrategy;
    fallbackStrategy: RetrievalStrategy;
    routingMetadata: {
        classifiedInMs: number;
        intent: QueryIntent;
        confidence: number;
    };
}
export interface RoutingStats {
    totalRoutes: number;
    byIntent: Record<QueryIntent, number>;
    byStrategy: Record<RetrievalStrategy, number>;
    avgConfidence: number;
}
export declare function classifyQuery(query: string): QueryClassification;
export declare function autoRoute(query: string, options?: AutoRouteOptions): Promise<RouteResult>;
export declare function getRoutingStats(): RoutingStats;
//# sourceMappingURL=query-router.d.ts.map