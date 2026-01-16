/**
 * Semantic ranking using embeddings (Stage 2 of two-stage detection)
 *
 * Takes candidates from Stage 1 hash-based prefiltering and ranks them
 * by semantic similarity using cosine distance on embedding vectors.
 *
 * This is the expensive stage but runs on much smaller candidate set.
 */
import { cosineSimilarity } from '../../../core/local-embeddings.js';
/**
 * Calculate confidence level based on multiple factors
 *
 * High confidence (>0.90):
 * - Very high cosine similarity
 * - Similar content length
 * - Same memory type
 * - High tag overlap
 *
 * Medium confidence (0.80-0.90):
 * - High similarity but some differences
 * - Related metadata
 *
 * Low confidence (<0.80):
 * - Lower similarity
 * - Should require manual verification
 */
function calculateConfidence(memory1, memory2, cosineSim) {
    // Check if cosine similarity alone indicates confidence
    if (cosineSim >= 0.90) {
        // Can upgrade based on other factors
        const factors = calculateConfidenceFactors(memory1, memory2);
        if (factors.sameType && factors.tagOverlap > 0.5) {
            return 'high';
        }
        if (factors.sameType || factors.tagOverlap > 0.3) {
            return 'high';
        }
        return 'medium';
    }
    if (cosineSim >= 0.80) {
        const factors = calculateConfidenceFactors(memory1, memory2);
        if (factors.sameType && factors.contentLengthSimilarity > 0.7) {
            return 'medium';
        }
        return 'medium';
    }
    return 'low';
}
function calculateConfidenceFactors(memory1, memory2) {
    // Check if same type
    const sameType = memory1.type === memory2.type;
    // Calculate tag overlap
    const tags1 = new Set(memory1.tags || []);
    const tags2 = new Set(memory2.tags || []);
    const overlap = Array.from(tags1).filter((tag) => tags2.has(tag)).length;
    const union = new Set([...tags1, ...tags2]).size;
    const tagOverlap = union === 0 ? 0 : overlap / union;
    // Calculate content length similarity
    const len1 = memory1.content.length;
    const len2 = memory2.content.length;
    const maxLen = Math.max(len1, len2);
    const minLen = Math.min(len1, len2);
    const contentLengthSimilarity = maxLen === 0 ? 1 : minLen / maxLen;
    return {
        sameType,
        tagOverlap,
        contentLengthSimilarity,
    };
}
/**
 * Generate merge reason text based on similarity analysis
 */
function generateMergeReason(memory1, memory2, cosineSim, confidenceLevel) {
    const factors = calculateConfidenceFactors(memory1, memory2);
    const parts = [];
    // Similarity
    parts.push(`Semantic similarity: ${(cosineSim * 100).toFixed(1)}%`);
    // Type match
    if (factors.sameType) {
        parts.push(`Same type (${memory1.type})`);
    }
    else {
        parts.push(`Different types (${memory1.type} vs ${memory2.type})`);
    }
    // Tag overlap
    if (factors.tagOverlap > 0) {
        parts.push(`${(factors.tagOverlap * 100).toFixed(0)}% tag overlap`);
    }
    // Content length
    const len1 = memory1.content.length;
    const len2 = memory2.content.length;
    const diffPercent = Math.abs(len1 - len2) / Math.max(len1, len2);
    parts.push(`Content length difference: ${(diffPercent * 100).toFixed(0)}%`);
    // Confidence note
    parts.push(`Confidence: ${confidenceLevel}`);
    return parts.join(' • ');
}
/**
 * Rank stage 1 candidates using embedding similarity
 *
 * This is the expensive phase, running only on candidates that passed
 * the fast hash-based prefilter.
 *
 * @param candidates Candidate pairs from stage 1
 * @param memories Map of memoryId -> Memory object
 * @param embeddings Map of memoryId -> embedding vector
 * @param options Ranking options
 * @returns Sorted list of ranked candidates (highest similarity first)
 */
export async function rankCandidates(candidates, memories, embeddings, options) {
    const semanticThreshold = options.semanticThreshold ?? 0.85;
    const topK = options.topK ?? 10;
    const rankedCandidates = [];
    // For each candidate pair, compute cosine similarity
    for (const { memoryId1, memoryId2 } of candidates) {
        const memory1 = memories.get(memoryId1);
        const memory2 = memories.get(memoryId2);
        const embedding1 = embeddings.get(memoryId1);
        const embedding2 = embeddings.get(memoryId2);
        // Skip if any required data is missing
        if (!memory1 || !memory2 || !embedding1 || !embedding2) {
            continue;
        }
        // Calculate cosine similarity
        const similarity = cosineSimilarity(embedding1, embedding2);
        // Skip if below threshold
        if (similarity < semanticThreshold) {
            continue;
        }
        // Calculate confidence and merge reason
        const confidence = calculateConfidence(memory1, memory2, similarity);
        const mergeReason = generateMergeReason(memory1, memory2, similarity, confidence);
        rankedCandidates.push({
            memoryId1,
            memoryId2,
            memory1,
            memory2,
            cosineSimilarity: similarity,
            confidenceLevel: confidence,
            mergeReason,
        });
    }
    // Sort by similarity (highest first)
    rankedCandidates.sort((a, b) => b.cosineSimilarity - a.cosineSimilarity);
    // Apply topK limit per memory to avoid explosion of proposals
    const selectedByMemory = new Map();
    const filtered = [];
    for (const candidate of rankedCandidates) {
        const count1 = (selectedByMemory.get(candidate.memoryId1) || 0) + 1;
        const count2 = (selectedByMemory.get(candidate.memoryId2) || 0) + 1;
        if (count1 <= topK && count2 <= topK) {
            filtered.push(candidate);
            selectedByMemory.set(candidate.memoryId1, count1);
            selectedByMemory.set(candidate.memoryId2, count2);
        }
    }
    return filtered;
}
/**
 * Analyze a single pair of memories for semantic similarity
 * Useful for interactive merge previews
 */
export function analyzePair(memory1, memory2, embedding1, embedding2) {
    const similarity = cosineSimilarity(embedding1, embedding2);
    const confidence = calculateConfidence(memory1, memory2, similarity);
    const mergeReason = generateMergeReason(memory1, memory2, similarity, confidence);
    const factors = calculateConfidenceFactors(memory1, memory2);
    return {
        cosineSimilarity: similarity,
        confidenceLevel: confidence,
        mergeReason,
        factors,
    };
}
//# sourceMappingURL=semantic-ranker.js.map