/**
 * Hash-based duplicate detection filters (Stage 1).
 * Uses SimHash and MinHash for fast approximate matching before semantic analysis.
 */
/**
 * SimHash: Fast fingerprinting for near-duplicate detection.
 * Tokenizes content, weights by frequency, and produces comparable hash fingerprints.
 * Similar documents produce similar hashes with Hamming distance indicating edit distance.
 */
export declare class SimHashFilter {
    private readonly dimensions;
    generateHash(content: string): string;
    hammingDistance(hash1: string, hash2: string): number;
    findCandidates(targetHash: string, allHashes: Map<string, string>, threshold: number): string[];
    private hashToken;
    private popcount;
}
/**
 * MinHash: Estimates Jaccard similarity using character n-grams and multiple hash functions.
 * Keeps minimum hash for each function, resulting in comparable signatures.
 * More effective than SimHash for paraphrases. 128 functions give ~1% error margin.
 */
export declare class MinHashFilter {
    private readonly numPermutations;
    private readonly ngramSize;
    generateSignature(content: string): number[];
    jaccardSimilarity(sig1: number[], sig2: number[]): number;
    findCandidates(targetSig: number[], allSigs: Map<string, number[]>, threshold: number): string[];
    private generateNgrams;
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
 * Combine SimHash and MinHash filters using union approach.
 * Candidates pass if they match EITHER filter, casting wider net for stage 2 ranking.
 */
export declare function findCandidatePairs(memories: Map<string, string>, allSimhashes: Map<string, string>, allMinhashes: Map<string, number[]>, options: {
    simhashThreshold?: number;
    minhashThreshold?: number;
}): Stage1CandidatePair[];
//# sourceMappingURL=hash-filters.d.ts.map