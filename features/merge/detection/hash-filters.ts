/**
 * Hash-based duplicate detection filters (Stage 1 of two-stage detection)
 *
 * Uses SimHash and MinHash for fast, approximate matching of similar content.
 * These filters are applied before expensive semantic similarity calculations.
 */

// ============================================================================
// SimHash Implementation (64-bit)
// ============================================================================

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
export class SimHashFilter {
  private readonly dimensions = 64; // 64-bit hash

  /**
   * Generate 64-bit SimHash from text content
   * Returns hex string representation of hash
   */
  generateHash(content: string): string {
    if (!content || content.trim().length === 0) {
      return '0'.repeat(16); // Return zero hash for empty content
    }

    // Tokenize content into words (lowercase, alphanumeric only)
    const tokens = content
      .toLowerCase()
      .split(/\W+/)
      .filter((token) => token.length > 0);

    if (tokens.length === 0) {
      return '0'.repeat(16);
    }

    // Calculate term frequencies
    const tokenFreq = new Map<string, number>();
    for (const token of tokens) {
      tokenFreq.set(token, (tokenFreq.get(token) || 0) + 1);
    }

    // Initialize hash bits
    const hashBits = new Array(this.dimensions).fill(0);

    // For each token, hash it and weight by frequency
    for (const [token, freq] of tokenFreq.entries()) {
      // Hash token to 128-bit value (we'll use parts of it)
      const tokenHash = this.hashToken(token);

      // For each bit position, add weight if bit is set
      for (let i = 0; i < this.dimensions; i++) {
        const bitSet = (tokenHash >>> i) & 1;
        hashBits[i] += bitSet === 1 ? freq : -freq;
      }
    }

    // Quantize: if sum is positive, set bit to 1
    let result = 0;
    for (let i = 0; i < this.dimensions; i++) {
      if (hashBits[i] > 0) {
        result |= 1 << i;
      }
    }

    // Convert to hex string
    return result.toString(16).padStart(16, '0');
  }

  /**
   * Calculate Hamming distance between two SimHashes
   * Returns number of differing bits (0-64)
   */
  hammingDistance(hash1: string, hash2: string): number {
    // Convert hex to big int
    const num1 = BigInt('0x' + hash1);
    const num2 = BigInt('0x' + hash2);

    // XOR and count set bits
    const xor = num1 ^ num2;
    return this.popcount(xor);
  }

  /**
   * Find candidate memories with similar SimHash
   * Uses Hamming distance threshold (lower = more similar)
   *
   * @param targetHash SimHash of target memory
   * @param allHashes Map of memoryId -> simhash
   * @param threshold Maximum Hamming distance (0-64, typically 3-6)
   * @returns Array of similar memory IDs
   */
  findCandidates(
    targetHash: string,
    allHashes: Map<string, string>,
    threshold: number
  ): string[] {
    const candidates: string[] = [];

    for (const [memoryId, hash] of allHashes.entries()) {
      const distance = this.hammingDistance(targetHash, hash);
      if (distance <= threshold) {
        candidates.push(memoryId);
      }
    }

    return candidates;
  }

  /**
   * Simple FNV-1a hash for tokens (produces 64-bit output)
   */
  private hashToken(token: string): number {
    let hash = 2166136261; // FNV offset basis (32-bit)

    for (let i = 0; i < token.length; i++) {
      hash ^= token.charCodeAt(i);
      hash = (hash * 16777619) & 0xffffffff; // FNV prime (32-bit)
    }

    // Extend to 64-bit by rehashing
    const high = hash >>> 16;
    const low = hash & 0xffff;
    return (high * 65599 + low) >>> 0;
  }

  /**
   * Count number of set bits in a BigInt
   */
  private popcount(n: bigint): number {
    let count = 0;
    while (n > 0n) {
      count += Number(n & 1n);
      n = n >> 1n;
    }
    return count;
  }
}

// ============================================================================
// MinHash Implementation (128 permutations)
// ============================================================================

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
export class MinHashFilter {
  private readonly numPermutations = 128; // Number of independent hash functions
  private readonly ngramSize = 3; // Character n-gram size

  /**
   * Generate MinHash signature from text content
   * Returns array of 128 minimum hash values
   */
  generateSignature(content: string): number[] {
    if (!content || content.trim().length === 0) {
      // Return all zeros for empty content
      return new Array(this.numPermutations).fill(0);
    }

    // Generate character n-grams (case-insensitive, with spaces preserved)
    const ngrams = this.generateNgrams(content.toLowerCase(), this.ngramSize);

    if (ngrams.length === 0) {
      return new Array(this.numPermutations).fill(0);
    }

    // Initialize signature with max values
    const signature = new Array(this.numPermutations).fill(Number.MAX_SAFE_INTEGER);

    // For each n-gram, apply all hash functions and track minimum
    for (const ngram of ngrams) {
      for (let i = 0; i < this.numPermutations; i++) {
        const hashValue = this.hashNgramWithSeed(ngram, i);
        signature[i] = Math.min(signature[i], hashValue);
      }
    }

    return signature;
  }

  /**
   * Calculate Jaccard similarity estimate from two MinHash signatures
   * Returns value between 0 and 1 (higher = more similar)
   *
   * Jaccard(A,B) ≈ (number of matching positions) / (total positions)
   */
  jaccardSimilarity(sig1: number[], sig2: number[]): number {
    if (sig1.length !== sig2.length) {
      return 0;
    }

    if (sig1.length === 0) {
      return 1; // Both empty
    }

    let matches = 0;
    for (let i = 0; i < sig1.length; i++) {
      if (sig1[i] === sig2[i]) {
        matches++;
      }
    }

    return matches / sig1.length;
  }

  /**
   * Find candidate memories with similar MinHash signature
   * Uses Jaccard similarity threshold (higher = more similar)
   *
   * @param targetSig MinHash signature of target memory
   * @param allSigs Map of memoryId -> minhash signature
   * @param threshold Minimum Jaccard similarity (typically 0.6-0.8)
   * @returns Array of similar memory IDs
   */
  findCandidates(
    targetSig: number[],
    allSigs: Map<string, number[]>,
    threshold: number
  ): string[] {
    const candidates: string[] = [];

    for (const [memoryId, sig] of allSigs.entries()) {
      const similarity = this.jaccardSimilarity(targetSig, sig);
      if (similarity >= threshold) {
        candidates.push(memoryId);
      }
    }

    return candidates;
  }

  /**
   * Generate character n-grams from content
   */
  private generateNgrams(content: string, size: number): string[] {
    const ngrams: string[] = [];

    // Add padding
    const padded = ' '.repeat(size - 1) + content + ' '.repeat(size - 1);

    for (let i = 0; i <= padded.length - size; i++) {
      ngrams.push(padded.substring(i, i + size));
    }

    return ngrams;
  }

  /**
   * Hash n-gram with seed (creates multiple hash functions)
   * Uses MurmurHash3 inspired algorithm
   */
  private hashNgramWithSeed(ngram: string, seed: number): number {
    let hash = seed;

    for (let i = 0; i < ngram.length; i++) {
      hash = (hash << 5) - hash + ngram.charCodeAt(i);
      hash = hash & hash; // Convert to 32-bit integer
    }

    return Math.abs(hash);
  }
}

// ============================================================================
// Hybrid Stage 1 Filter
// ============================================================================

export interface Stage1CandidatePair {
  memoryId1: string;
  memoryId2: string;
  simhashDistance: number;
  minhashSimilarity: number;
  matched: 'simhash' | 'minhash' | 'both'; // Which filter matched
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
export function findCandidatePairs(
  memories: Map<string, string>,
  allSimhashes: Map<string, string>,
  allMinhashes: Map<string, number[]>,
  options: {
    simhashThreshold?: number; // Default: 4 bits
    minhashThreshold?: number; // Default: 0.7
  }
): Stage1CandidatePair[] {
  const simhashThreshold = options.simhashThreshold ?? 4;
  const minhashThreshold = options.minhashThreshold ?? 0.7;

  const simhashFilter = new SimHashFilter();
  const minhashFilter = new MinHashFilter();

  const candidatePairs: Stage1CandidatePair[] = [];
  const seen = new Set<string>(); // Avoid duplicates

  const memoryIds = Array.from(memories.keys());

  for (let i = 0; i < memoryIds.length; i++) {
    const id1 = memoryIds[i];
    const simhash1 = allSimhashes.get(id1);
    const minhash1 = allMinhashes.get(id1);

    if (!simhash1 || !minhash1) continue;

    for (let j = i + 1; j < memoryIds.length; j++) {
      const id2 = memoryIds[j];
      const simhash2 = allSimhashes.get(id2);
      const minhash2 = allMinhashes.get(id2);

      if (!simhash2 || !minhash2) continue;

      const pairKey = id1 < id2 ? `${id1}:${id2}` : `${id2}:${id1}`;
      if (seen.has(pairKey)) continue;

      // Check SimHash
      const simhashDist = simhashFilter.hammingDistance(simhash1, simhash2);
      const simhashMatch = simhashDist <= simhashThreshold;

      // Check MinHash
      const minhashSim = minhashFilter.jaccardSimilarity(minhash1, minhash2);
      const minhashMatch = minhashSim >= minhashThreshold;

      // Include if either filter matches (union)
      if (simhashMatch || minhashMatch) {
        seen.add(pairKey);
        candidatePairs.push({
          memoryId1: id1,
          memoryId2: id2,
          simhashDistance: simhashDist,
          minhashSimilarity: minhashSim,
          matched: simhashMatch && minhashMatch ? 'both' : simhashMatch ? 'simhash' : 'minhash',
        });
      }
    }
  }

  return candidatePairs;
}
