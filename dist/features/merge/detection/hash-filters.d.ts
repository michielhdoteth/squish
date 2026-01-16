/**
 * Hash-based duplicate detection filters (Stage 1 of two-stage detection)
 *
 * Uses SimHash and MinHash for fast, approximate matching of similar content.
 * These filters are applied before expensive semantic similarity calculations.
 */
/**
 * SimHash: Fast fingerprinting algorithm for near-duplicate detection
 *
 * How it works:
 * 1. Tokenize content into words
 * 2. Hash each token
 * 3. Weight by TF-IDF (term frequency in document)
 * 4. Set hash bits based on weighted sum
 * 5. Compare Hamming distance between hashes
 *
 * Properties:
 * - Similar documents produce similar hashes
 * - Hamming distance ~ edit distance
 * - Very fast: O(n) where n = number of tokens
 */
export declare class SimHashFilter {
    private readonly dimensions;
    /**
     * Generate 64-bit SimHash from text content
     * Returns hex string representation of hash
     */
    generateHash(content: string): string;
    /**
     * Calculate Hamming distance between two SimHashes
     * Returns number of differing bits (0-64)
     */
    hammingDistance(hash1: string, hash2: string): number;
    /**
     * Find candidate memories with similar SimHash
     * Uses Hamming distance threshold (lower = more similar)
     *
     * @param targetHash SimHash of target memory
     * @param allHashes Map of memoryId -> simhash
     * @param threshold Maximum Hamming distance (0-64, typically 3-6)
     * @returns Array of similar memory IDs
     */
    findCandidates(targetHash: string, allHashes: Map<string, string>, threshold: number): string[];
    /**
     * Simple FNV-1a hash for tokens (produces 64-bit output)
     */
    private hashToken;
    /**
     * Count number of set bits in a BigInt
     */
    private popcount;
}
/**
 * MinHash: Probabilistic data structure for estimating Jaccard similarity
 *
 * How it works:
 * 1. Generate character n-grams from content
 * 2. Apply multiple independent hash functions
 * 3. Keep minimum hash for each function
 * 4. Use signature (array of mins) to estimate Jaccard similarity
 * 5. Compare signatures
 *
 * Properties:
 * - Estimates Jaccard similarity accurately
 * - Handles paraphrases and rewording better than SimHash
 * - Each hash function adds ~1% memory
 * - 128 functions gives ~1% error
 */
export declare class MinHashFilter {
    private readonly numPermutations;
    private readonly ngramSize;
    /**
     * Generate MinHash signature from text content
     * Returns array of 128 minimum hash values
     */
    generateSignature(content: string): number[];
    /**
     * Calculate Jaccard similarity estimate from two MinHash signatures
     * Returns value between 0 and 1 (higher = more similar)
     *
     * Jaccard(A,B) ≈ (number of matching positions) / (total positions)
     */
    jaccardSimilarity(sig1: number[], sig2: number[]): number;
    /**
     * Find candidate memories with similar MinHash signature
     * Uses Jaccard similarity threshold (higher = more similar)
     *
     * @param targetSig MinHash signature of target memory
     * @param allSigs Map of memoryId -> minhash signature
     * @param threshold Minimum Jaccard similarity (typically 0.6-0.8)
     * @returns Array of similar memory IDs
     */
    findCandidates(targetSig: number[], allSigs: Map<string, number[]>, threshold: number): string[];
    /**
     * Generate character n-grams from content
     */
    private generateNgrams;
    /**
     * Hash n-gram with seed (creates multiple hash functions)
     * Uses MurmurHash3 inspired algorithm
     */
    private hashNgramWithSeed;
}
export interface Stage1CandidatePair {
    memoryId1: string;
    memoryId2: string;
    simhashDistance: number;
    minhashSimilarity: number;
    matched: 'simhash' | 'minhash' | 'both';
}
/**
 * Stage 1 prefilter combining both SimHash and MinHash
 *
 * Uses union approach: candidates are included if they pass EITHER filter.
 * This is more lenient but catches more potential duplicates for stage 2 ranking.
 *
 * @param memories Map of memoryId -> content
 * @param allSimhashes Map of memoryId -> simhash
 * @param allMinhashes Map of memoryId -> minhash signature
 * @param options Filter thresholds
 * @returns Array of candidate pairs
 */
export declare function findCandidatePairs(memories: Map<string, string>, allSimhashes: Map<string, string>, allMinhashes: Map<string, number[]>, options: {
    simhashThreshold?: number;
    minhashThreshold?: number;
}): Stage1CandidatePair[];
//# sourceMappingURL=hash-filters.d.ts.map