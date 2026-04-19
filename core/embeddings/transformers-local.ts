/**
 * Transformers.js Local Embedding Provider
 *
 * Uses ONNX-based transformer models for high-quality local embeddings.
 * Supports all-MiniLM-L6-v2 and other Hugging Face ONNX models.
 *
 * Usage:
 *   Set SQUISH_EMBEDDINGS_PROVIDER=transformers
 *   Optional: SQUISH_LOCAL_MODEL=onnx-community/all-MiniLM-L6-v2-ONNX
 *
 * Download models automatically on first use. Models cached in HuggingFace cache directory.
 */

import { pipeline, Pipeline } from '@huggingface/transformers';
import { logger } from '../logger.js';
import { config } from '../../config.js';

export interface TransformersLocalConfig {
  model: string;
  device: 'cpu' | 'webgpu';
  dtype: 'q8' | 'q4' | 'f16' | 'f32';
}

/**
 * Default configuration for local transformers
 */
const DEFAULT_CONFIG: TransformersLocalConfig = {
  model: 'onnx-community/all-MiniLM-L6-v2-ONNX',
  device: 'cpu',
  dtype: 'q8', // Quantized for smaller size + faster loading
};

// Singleton pipeline instance
let embeddingPipeline: Pipeline | null = null;
let isLoading = false;
let loadPromise: Promise<Pipeline | null> | null = null;

/**
 * Get or initialize the embedding pipeline (lazy loading)
 */
async function getPipeline(): Promise<Pipeline | null> {
  // Return existing pipeline
  if (embeddingPipeline) {
    return embeddingPipeline;
  }

  // Already loading - wait for it
  if (isLoading && loadPromise) {
    return loadPromise;
  }

  // Start loading
  isLoading = true;
  const model = config.transformersLocalModel || DEFAULT_CONFIG.model;

  logger.info(`Loading transformers local model: ${model}`);

  loadPromise = (async () => {
    try {
      embeddingPipeline = await pipeline(
        'feature-extraction',
        model as any,
        {
          device: DEFAULT_CONFIG.device as any,
          dtype: DEFAULT_CONFIG.dtype as any,
        }
      );

      logger.info(`Transformers local model loaded: ${model}`);
      return embeddingPipeline;
    } catch (error) {
      logger.error(`Failed to load transformers model: ${error}`);
      embeddingPipeline = null;
      throw error;
    } finally {
      isLoading = false;
      loadPromise = null;
    }
  })();

  return loadPromise;
}

/**
 * Check if pipeline is loaded
 */
export function isReady(): boolean {
  return embeddingPipeline !== null;
}

/**
 * Get embedding dimension for current model
 */
export function getEmbeddingDimension(): number {
  return 384; // all-MiniLM-L6-v2 outputs 384 dims
}

/**
 * Generate embedding for a single text input
 * Uses mean pooling + L2 normalization
 */
export async function getEmbedding(text: string): Promise<number[] | null> {
  if (!text || typeof text !== 'string') {
    return null;
  }

  try {
    const pipeline = await getPipeline();
    if (!pipeline) {
      return null;
    }

    // Truncate to max sequence length (256 tokens)
    const truncatedText = text.slice(0, 512);

    // Run feature extraction with pooling
    const output = await pipeline(truncatedText, {
      pooling: 'mean',
      normalize: true,
    });

    // Convert tensor to array
    const embedding = Array.from(output.data);

    return embedding;
  } catch (error) {
    logger.warn(`Transformers embedding error: ${error}`);
    return null;
  }
}

/**
 * Generate embeddings for multiple texts in batch
 * Processes efficiently with batching
 */
export async function getBatchEmbeddings(
  texts: string[],
  batchSize: number = 8
): Promise<Array<number[] | null>> {
  if (texts.length === 0) {
    return [];
  }

  const results: Array<number[] | null> = new Array(texts.length).fill(null);

  // Process in batches
  for (let i = 0; i < texts.length; i += batchSize) {
    const batchEnd = Math.min(i + batchSize, texts.length);
    const batch = texts.slice(i, batchEnd);
    const indices = [...Array(batch.length).keys()].map(j => i + j);

    try {
      const pipeline = await getPipeline();
      if (!pipeline) {
        continue;
      }

      // Truncate each text
      const truncatedBatch = batch.map(t => t.slice(0, 512));

      // Process batch
      const outputs = await Promise.all(
        truncatedBatch.map(text =>
          pipeline(text, { pooling: 'mean', normalize: true })
        )
      );

      // Store results
      for (let j = 0; j < outputs.length; j++) {
        results[indices[j]] = Array.from(outputs[j].data);
      }
    } catch (error) {
      logger.warn(`Transformers batch embedding error: ${error}`);
    }
  }

  return results;
}

/**
 * Check health of the transformers provider
 */
export async function checkHealth(): Promise<{
  available: boolean;
  latencyMs?: number;
  error?: string;
  model?: string;
  dimension?: number;
}> {
  const model = config.transformersLocalModel || DEFAULT_CONFIG.model;

  // Check if library is available
  try {
    await import('@huggingface/transformers');
  } catch (error) {
    return {
      available: false,
      error: '@huggingface/transformers not installed',
    };
  }

  // Try quick embedding
  const start = Date.now();
  try {
    const embedding = await getEmbedding('health check test');
    const latency = Date.now() - start;

    return {
      available: embedding !== null && embedding.length > 0,
      latencyMs: latency,
      model,
      dimension: embedding?.length || 0,
    };
  } catch (error) {
    return {
      available: false,
      error: (error as Error).message,
      model,
    };
  }
}

/**
 * Unload the pipeline (for testing or memory management)
 */
export async function unload(): Promise<void> {
  if (embeddingPipeline) {
    // Pipeline doesn't have explicit cleanup, just release reference
    embeddingPipeline = null;
    logger.info('Transformers pipeline unloaded');
  }
}

/**
 * Warm up the model with a test input
 */
export async function warmup(): Promise<boolean> {
  try {
    const result = await getEmbedding('warmup test');
    return result !== null && result.length > 0;
  } catch {
    return false;
  }
}

export default {
  isReady,
  getEmbeddingDimension,
  getEmbedding,
  getBatchEmbeddings,
  checkHealth,
  unload,
  warmup,
};