import { config } from '../config.js';
import { getGoogleMultimodalEmbedding, isMultimodalInput, MultimodalInput } from './embeddings/google-multimodal.js';
import { logger } from './logger.js';

export type EmbeddingProvider = 'local' | 'openai' | 'ollama' | 'google' | 'none' | 'auto';

// Retry utility with exponential backoff
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = config.embeddingsMaxRetries,
  baseDelayMs: number = config.embeddingsRetryDelayMs
): Promise<T> {
  let lastError: Error | undefined;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      // Only retry on network errors (5xx, ECONNRESET, ETIMEDOUT, etc.)
      if (error instanceof Error && shouldRetryError(error)) {
        const delay = baseDelayMs * Math.pow(2, attempt) + Math.random() * baseDelayMs;
        logger.debug(`Embedding request failed (attempt ${attempt + 1}/${maxRetries}), retrying in ${delay.toFixed(0)}ms`, { error: error as Error });
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      // Don't retry on 4xx errors or non-retryable errors
      break;
    }
  }
  
  throw lastError;
}

function shouldRetryError(error: Error): boolean {
  const message = error.message.toLowerCase();
  
  // Network errors that are typically transient
  const retryablePatterns = [
    'econnreset',
    'etimedout',
    'econnrefused',
    'esocket',
    'network error',
    'fetch failed',
    'timeout',
    'request timed out',
    'service unavailable',
    'too many requests',
    'rate limit',
    'internal server error',
    'bad gateway',
    'gateway timeout',
  ];
  
  return retryablePatterns.some(pattern => message.includes(pattern));
}

// Timeout wrapper using AbortController
async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    return await promise;
  } finally {
    clearTimeout(timeoutId);
  }
}

// Fetch wrapper that combines retry and timeout
async function fetchWithRetryAndTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number = config.embeddingsTimeoutMs
): Promise<Response> {
  return withRetry(async () => {
    return withTimeout(fetch(url, options), timeoutMs);
  });
}

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

export async function getEmbedding(input: string | MultimodalInput): Promise<number[] | null> {
  if (!input || (typeof input !== 'string' && !isMultimodalInput(input))) {
    return null;
  }

  const provider = config.embeddingsProvider;
  const cacheKey = typeof input === 'string' 
    ? getCacheKey(input, provider)
    : getCacheKey(JSON.stringify(input), provider);
  
  // Check cache first
  const cached = getCachedEmbedding(cacheKey);
  if (cached) {
    return cached;
  }

  let result: number[] | null = null;

   // Handle multimodal input
   if (isMultimodalInput(input) && provider === 'google') {
     const multimodalResult = await getGoogleMultimodalEmbedding(input);
     if (multimodalResult) {
       result = multimodalResult.embedding;
     }
   }

   // Handle text-only input
   if (!result && typeof input === 'string') {
     const textInput = input;

     if (provider === 'none') {
       result = null;
     } else if (provider === 'google') {
       const multimodalResult = await getGoogleMultimodalEmbedding({ text: textInput });
       result = multimodalResult?.embedding || null;
     } else if (provider === 'openai') {
       result = await getOpenAiEmbedding(textInput);
     } else if (provider === 'ollama') {
       result = await getOllamaEmbedding(textInput);
     } else if (provider === 'local') {
       result = getLocalEmbedding(textInput);
     } else {
       // Auto mode: try cloud providers first if configured, then fall back to local
       if (config.openAiApiKey) {
         result = await getOpenAiEmbedding(textInput);
       }
       if (!result && config.ollamaUrl) {
         result = await getOllamaEmbedding(textInput);
       }
       if (!result) {
         result = getLocalEmbedding(textInput);
       }
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
    const response = await fetchWithRetryAndTimeout(config.openAiApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.openAiApiKey}`,
      },
      body: JSON.stringify({
        model: config.openAiEmbeddingModel,
        input,
      }),
    }, config.openAiTimeoutMs);

    if (!response.ok) {
      const message = await response.text();
      logger.warn(`OpenAI embeddings failed: ${response.status} ${message}`);
      return null; // Return null to allow fallback
    }

    const payload = await response.json() as { data?: Array<{ embedding: number[] }> };
    const embedding = payload.data?.[0]?.embedding;
    return embedding ?? null;
  } catch (error) {
    logger.warn('OpenAI embeddings error:', { error: error as Error });
    return null; // Return null to allow fallback
  }
}

async function getOllamaEmbedding(input: string): Promise<number[] | null> {
  try {
    const response = await fetchWithRetryAndTimeout(`${config.ollamaUrl}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.ollamaEmbeddingModel,
        prompt: input,
      }),
    }, config.ollamaTimeoutMs);

    if (!response.ok) {
      const message = await response.text();
      logger.warn(`Ollama embeddings failed: ${response.status} ${message}`);
      return null; // Return null to allow fallback
    }

    const payload = await response.json() as { embedding?: number[] };
    return payload.embedding ?? null;
  } catch (error) {
    logger.warn('Ollama embeddings error:', { error: error as Error });
    return null; // Return null to allow fallback
  }
}

/**
 * Check health of all configured embedding providers
 * Returns availability and latency for each provider
 */
export async function checkEmbeddingProviderHealth(): Promise<Map<string, { available: boolean; latencyMs?: number; error?: string }>> {
  const results = new Map<string, { available: boolean; latencyMs?: number; error?: string }>();
  const providers = ['local', 'openai', 'ollama', 'google', 'none', 'auto'] as const;
  
  // Test local provider (always available)
  results.set('local', { available: true, latencyMs: 0 });
  
  // Test OpenAI if configured
  if (config.openAiApiKey) {
    const start = Date.now();
    try {
      const testInput = 'health check';
      const embedding = await withRetry(
        () => withTimeout(getOpenAiEmbedding(testInput), config.openAiTimeoutMs),
        config.embeddingsMaxRetries,
        config.embeddingsRetryDelayMs
      );
      const latency = Date.now() - start;
      results.set('openai', { 
        available: embedding !== null && embedding.length > 0, 
        latencyMs: latency 
      });
    } catch (error) {
      results.set('openai', { 
        available: false, 
        error: (error as Error).message 
      });
    }
  } else {
    results.set('openai', { available: false, error: 'Not configured' });
  }
  
  // Test Ollama if configured
  if (config.ollamaUrl) {
    const start = Date.now();
    try {
      const testInput = 'health check';
      const embedding = await withRetry(
        () => withTimeout(getOllamaEmbedding(testInput), config.ollamaTimeoutMs),
        config.embeddingsMaxRetries,
        config.embeddingsRetryDelayMs
      );
      const latency = Date.now() - start;
      results.set('ollama', { 
        available: embedding !== null && embedding.length > 0, 
        latencyMs: latency 
      });
    } catch (error) {
      results.set('ollama', { 
        available: false, 
        error: (error as Error).message 
      });
    }
  } else {
    results.set('ollama', { available: false, error: 'Not configured' });
  }
  
  // Test Google if configured
  if (config.googleCloudApiKey || config.googleCloudProject) {
    const start = Date.now();
    try {
      const result = await withRetry(
        () => withTimeout(getGoogleMultimodalEmbedding({ text: 'health check' }), config.googleTimeoutMs),
        config.embeddingsMaxRetries,
        config.embeddingsRetryDelayMs
      );
      const latency = Date.now() - start;
      results.set('google', { 
        available: result !== null && result.embedding.length > 0, 
        latencyMs: latency 
      });
    } catch (error) {
      results.set('google', { 
        available: false, 
        error: (error as Error).message 
      });
    }
  } else {
    results.set('google', { available: false, error: 'Not configured' });
  }

  return results;
}
