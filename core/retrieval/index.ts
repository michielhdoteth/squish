/**
 * Retrieval Module - Enhanced search capabilities
 *
 * This module provides:
 * - Cross-encoder reranking for precision
 * - Contextual enrichment for better disambiguation
 * - MMR diversity injection to reduce redundancy
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
  calculateCompositeScore,
} from './config.js';
