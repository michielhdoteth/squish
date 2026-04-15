/**
 * Utility functions for local embeddings
 * Note: Actual embedding generation is in core/embeddings.ts
 */

import { cosineSimilarity as vectorCosineSimilarity } from '../utils/vector-operations.js';

/**
 * @deprecated Use cosineSimilarity from core/utils/vector-operations.ts directly.
 *   This re-export is for backward compatibility and will be removed in v1.2.0.
 */
export const cosineSimilarity = vectorCosineSimilarity;
