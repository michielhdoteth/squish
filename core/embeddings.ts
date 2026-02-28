import { config } from '../config.js';
import { getQMDClient } from './embeddings/qmd-client.js';
import { logger } from './logger.js';

export type EmbeddingProvider = 'openai' | 'ollama' | 'local' | 'none' | 'auto' | 'qmd' | 'hybrid';

// Simple in-memory cache for embeddings (LRU with 1000 entries)
const embeddingCache = new Map<string, number[]>();
const MAX_CACHE_SIZE = 1000;

function getCacheKey(input: string, provider: string): string {
  // Simple hash of input + provider
  let hash = 0;
  const str = input + provider;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash.toString();
}

function getCachedEmbedding(key: string): number[] | undefined {
  return embeddingCache.get(key);
}

function setCachedEmbedding(key: string, embedding: number[]): void {
  if (embeddingCache.size >= MAX_CACHE_SIZE) {
    // Remove oldest entry (first one)
    const firstKey = embeddingCache.keys().next().value;
    if (firstKey) {
      embeddingCache.delete(firstKey);
    }
  }
  embeddingCache.set(key, embedding);
}

export async function getEmbedding(input: string): Promise<number[] | null> {
  if (!input || typeof input !== 'string') {
    return null;
  }

  const provider = config.embeddingsProvider;
  const cacheKey = getCacheKey(input, provider);
  
  // Check cache first
  const cached = getCachedEmbedding(cacheKey);
  if (cached) {
    return cached;
  }

  let result: number[] | null = null;

  if (provider === 'none') {
    result = null;
  } else if (provider === 'qmd') {
    result = await getQMDEmbedding(input);
    // Fallback if QMD fails (unless qmd-only mode)
    if (!result && config.qmdFallbackMode !== 'qmd-only') {
      result = getLocalEmbedding(input);
    }
  } else if (provider === 'hybrid') {
    // Hybrid mode: Try QMD first, then cloud providers, then local
    if (config.qmdEnabled) {
      result = await getQMDEmbedding(input);
    }
    if (!result && config.qmdFallbackMode !== 'qmd-only') {
      result = await getOllamaEmbedding(input);
    }
    if (!result && config.qmdFallbackMode !== 'qmd-only' && config.qmdFallbackMode !== 'local-only') {
      result = await getOpenAiEmbedding(input);
    }
    if (!result) {
      result = getLocalEmbedding(input);
    }
  } else if (provider === 'openai') {
    result = await getOpenAiEmbedding(input);
  } else if (provider === 'ollama') {
    result = await getOllamaEmbedding(input);
  } else if (provider === 'local') {
    result = getLocalEmbedding(input);
  } else {
    // Auto mode: use local TF-IDF by default (fast, no API needed)
    // Only try external providers if explicitly configured
    if (config.openAiApiKey) {
      result = await getOpenAiEmbedding(input);
    }
    if (!result && config.ollamaUrl) {
      result = await getOllamaEmbedding(input);
    }
    if (!result) {
      result = getLocalEmbedding(input);
    }
  }

  // Cache the result if valid
  if (result) {
    setCachedEmbedding(cacheKey, result);
  }

  return result;
}

/**
 * Get embeddings for multiple inputs in parallel batches
 * Processes inputs in batches to respect rate limits while parallelizing
 */
export async function getBatchEmbeddings(
  inputs: string[],
  batchSize: number = 20
): Promise<Array<number[] | null>> {
  if (inputs.length === 0) return [];

  const results: Array<number[] | null> = new Array(inputs.length).fill(null);
  const provider = config.embeddingsProvider;

  // Check cache for all inputs first
  const uncachedIndices: number[] = [];
  const uncachedInputs: string[] = [];

  for (let i = 0; i < inputs.length; i++) {
    const cacheKey = getCacheKey(inputs[i], provider);
    const cached = getCachedEmbedding(cacheKey);
    if (cached) {
      results[i] = cached;
    } else {
      uncachedIndices.push(i);
      uncachedInputs.push(inputs[i]);
    }
  }

  // Process only uncached inputs in batches
  for (let i = 0; i < uncachedInputs.length; i += batchSize) {
    const batchEnd = Math.min(i + batchSize, uncachedInputs.length);
    const batch = uncachedInputs.slice(i, batchEnd);
    const indices = uncachedIndices.slice(i, batchEnd);

    // Parallelize embeddings within batch using Promise.all
    const batchResults = await Promise.all(
      batch.map((input) => getEmbedding(input))
    );

    // Store results in correct positions and cache
    for (let j = 0; j < batchResults.length; j++) {
      results[indices[j]] = batchResults[j];
    }
  }

  return results;
}

/**
 * Clear the embedding cache
 */
export function clearEmbeddingCache(): void {
  embeddingCache.clear();
}

/**
 * Get embedding cache statistics
 */
export function getEmbeddingCacheStats(): { size: number; maxSize: number } {
  return {
    size: embeddingCache.size,
    maxSize: MAX_CACHE_SIZE,
  };
}

/**
 * Local TF-IDF embedding using character n-grams and word hashing
 * Creates a 768-dimensional vector (same size as OpenAI text-embedding-3-small)
 * Fast, no API calls, works offline
 */
function getLocalEmbedding(input: string): number[] | null {
  if (!input || typeof input !== 'string') {
    return null;
  }

  // Normalize text
  const text = input.toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (text.length === 0) {
    return null;
  }

  // Embedding dimensions
  const dimensions = 768;
  const vector: number[] = new Array(dimensions).fill(0);

  // Character n-grams (3-5 grams for semantic similarity)
  const ngrams = [3, 4, 5];
  for (const n of ngrams) {
    for (let i = 0; i <= text.length - n; i++) {
      const gram = text.substring(i, i + n);
      const hash = djb2Hash(gram);
      const idx = Math.abs(hash) % dimensions;
      vector[idx] += 1;
    }
  }

  // Word-level hashing for semantic capture
  const words = text.split(/\s+/).filter(w => w.length > 2);
  for (const word of words) {
    const hash = djb2Hash(word);
    const idx = Math.abs(hash) % dimensions;
    vector[idx] += 2; // Words weighted higher than n-grams

    // Bigrams
    if (words.length > 1) {
      const idx2 = words.indexOf(word);
      if (idx2 < words.length - 1) {
        const bigram = `${word}_${words[idx2 + 1]}`;
        const bigramHash = djb2Hash(bigram);
        const bigramIdx = Math.abs(bigramHash) % dimensions;
        vector[bigramIdx] += 3; // Bigrams weighted highest
      }
    }
  }

  // Apply TF-IDF-like scaling: square root to dampen high frequencies
  for (let i = 0; i < dimensions; i++) {
    if (vector[i] > 0) {
      vector[i] = Math.sqrt(vector[i]);
    }
  }

  // L2 normalize
  const norm = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
  if (norm > 0) {
    for (let i = 0; i < dimensions; i++) {
      vector[i] /= norm;
    }
  }

  return vector;
}

/**
 * Get embedding via QMD
 * Note: QMD doesn't expose direct embedding generation via MCP.
 * This function returns null to trigger fallback to other providers.
 * The main QMD integration value is through hybrid search (qmd_query).
 */
async function getQMDEmbedding(input: string): Promise<number[] | null> {
  if (!config.qmdEnabled) {
    return null;
  }

  try {
    const client = await getQMDClient();
    const available = await client.isAvailable();

    if (!available) {
      return null;
    }

    // QMD doesn't expose direct embedding generation via MCP
    // The search tools use embeddings internally but don't return them
    //
    // For embedding generation, we rely on fallback providers
    // QMD's main value is through the qmd_search, qmd_vsearch, qmd_query tools
    return null;
  } catch (error) {
    logger.debug(`QMD embedding unavailable: ${error}`);
    return null;
  }
}

/**
 * DJB2 hash function - fast, good distribution
 */
function djb2Hash(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
  }
  return hash;
}

async function getOpenAiEmbedding(input: string): Promise<number[] | null> {
  if (!config.openAiApiKey) return null;
  
  try {
    const response = await fetch(config.openAiApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.openAiApiKey}`,
      },
      body: JSON.stringify({
        model: config.openAiEmbeddingModel,
        input,
      }),
    });

    if (!response.ok) {
      const message = await response.text();
      console.warn(`OpenAI embeddings failed: ${response.status} ${message}`);
      return null; // Return null to allow fallback
    }

    const payload = await response.json() as { data?: Array<{ embedding: number[] }> };
    const embedding = payload.data?.[0]?.embedding;
    return embedding ?? null;
  } catch (error) {
    console.warn('OpenAI embeddings error:', error);
    return null; // Return null to allow fallback
  }
}

async function getOllamaEmbedding(input: string): Promise<number[] | null> {
  try {
    const response = await fetch(`${config.ollamaUrl}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.ollamaEmbeddingModel,
        prompt: input,
      }),
    });

    if (!response.ok) {
      const message = await response.text();
      console.warn(`Ollama embeddings failed: ${response.status} ${message}`);
      return null; // Return null to allow fallback
    }

    const payload = await response.json() as { embedding?: number[] };
    return payload.embedding ?? null;
  } catch (error) {
    console.warn('Ollama embeddings error:', error);
    return null; // Return null to allow fallback
  }
}
