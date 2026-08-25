/**
 * Retrieval Module - Enhanced search capabilities
 *
 * This module provides:
 * - Cross-encoder reranking for precision
 * - Contextual enrichment for better disambiguation
 * - MMR diversity injection to reduce redundancy
 * - Query expansion with synonyms (advanced retrieval)
 * - Entity-aware retrieval with boost scoring (advanced retrieval)
 * - Temporal validity tracking (advanced retrieval)
 * - Query router for intent classification and strategy selection
 */

export {
  rerankResults,
  scorePair,
  scoreBatch,
  isReady as isRerankerReady,
  checkHealth as checkRerankerHealth,
  getRerankerConfig,
} from './cross-encoder-reranker.js';

export {
  enrichContent,
  enrichBatch,
  generateContextPrefix,
  extractTopics,
  checkHealth as checkContextualHealth,
  getContextualConfig,
} from './contextual-enrichment.js';

export {
  applyMMR,
  applyMMRByContent,
  smartMMR,
  checkHealth as checkMMRHealth,
  getMMRConfig,
} from './mmr-diversity.js';

export {
  getRetrievalConfig,
  getEnvRetrievalConfig,
} from './config.js';

export {
  expandQuery,
  type QueryExpansionConfig,
} from './query-expansion.js';

export {
  extractQueryEntities,
  entityBoost,
  type EntityConfig,
} from './entity-aware-retrieval.js';

export {
  detectTemporalReferences,
  isLikelyStale,
  isValidAt,
  applyTemporalEligibility,
  normalizeTimestampValue,
  TEMPORAL_VALID_AT_T_BOOST,
  type TemporalConfig,
  type TemporalValidityInput,
  type TemporalEligibility,
} from './temporal-validity.js';

export {
  parseTimeReference,
  type TimeReference,
  type TimeReferenceKind,
} from './temporal-query.js';

export {
  autoRoute,
  classifyQuery,
  getRoutingStats,
  type QueryIntent,
  type RetrievalStrategy,
  type QueryClassification,
  type AutoRouteOptions,
  type RouteResult,
  type RoutingStats,
} from './query-router.js';
