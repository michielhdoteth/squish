/**
 * Transformers.js Local Embedding Provider
 *
 * Uses ONNX-based transformer models for high-quality local embeddings.
 * Supports Hugging Face ONNX embedding models.
 *
 * Usage:
 *   Set SQUISH_EMBEDDINGS_PROVIDER=transformers
 *   Required: SQUISH_LOCAL_MODEL=<huggingface-onnx-model>
 *
 * Download models automatically on first use. Models cached in HuggingFace cache directory.
 */

import { pipeline } from '@huggingface/transformers';
import { logger } from '../logger.js';
import { config } from '../../config.js';

type Pipeline = Awaited<ReturnType<typeof pipeline>>;

export interface TransformersLocalConfig {
  model: string;
  device: 'cpu' | 'webgpu';
  dtype: 'q8' | 'q4' | 'f16' | 'f32';
}

const DEFAULT_CONFIG: TransformersLocalConfig = {
  model: '',
  device: 'cpu',
  dtype: 'q8', // Quantized for smaller size + faster loading
};

// Singleton pipeline instance
let embeddingPipeline: Pipeline | null = null;
let isLoading = false;
let loadPromise: Promise<Pipeline | null> | null = null;

// Model explicitly activated by the embeddings orchestrator (bundled-model
// path). SQUISH_LOCAL_MODEL always wins over this.
let activeModelOverride = '';

/** Activate a model for pipelines created without SQUISH_LOCAL_MODEL set. */
export function setActiveModel(model: string): void {
  activeModelOverride = model;
  if (embeddingPipeline) {
    embeddingPipeline = null; // force rebuild with the new model
  }
}

function resolveActiveModel(): string {
  return config.transformersLocalModel || activeModelOverride;
}

// Dimension observed from the last successful embed, plus known output dims
// for common bundled models so getEmbeddingDimension() is meaningful even
// before the first inference (fixes the hardcoded-0 bug).
let lastKnownDim = 0;

const KNOWN_MODEL_DIMS: Record<string, number> = {
  'Xenova/all-MiniLM-L6-v2': 384,
  'Xenova/bge-small-en-v1.5': 384,
  'Xenova/all-mpnet-base-v2': 768,
  'Xenova/e5-small-v2': 384,
  'Xenova/multilingual-e5-small': 384,
};

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
  const model = resolveActiveModel();
  if (!model) {
    isLoading = false;
    throw new Error('Transformers provider requires SQUISH_LOCAL_MODEL to be set');
  }

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
 * Get embedding dimension for current model.
 *
 * Resolution order:
 * 1. Dimension observed from the last successful inference (authoritative)
 * 2. Known static dim for the configured model
 * 3. 0 when the model is unknown and has not run yet
 */
export function getEmbeddingDimension(): number {
  if (lastKnownDim > 0) return lastKnownDim;
  const model = resolveActiveModel();
  if (model) {
    for (const [key, dim] of Object.entries(KNOWN_MODEL_DIMS)) {
      if (model.includes(key)) return dim;
    }
  }
  return 0;
}

/** Identifier stamped into embedding_model on writes, e.g. "transformers:Xenova/all-MiniLM-L6-v2:q8". */
export function getModelId(): string {
  const model = resolveActiveModel() || 'unknown';
  return `transformers:${model}:${DEFAULT_CONFIG.dtype}`;
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
    const embedPipeline = await getPipeline();
    if (!embedPipeline) {
      return null;
    }

    // Truncate to max sequence length (256 tokens)
    const truncatedText = text.slice(0, 512);

    // Run feature extraction with pooling
    const output = await (embedPipeline as any)(truncatedText, {
      pooling: 'mean',
      normalize: true,
    });

    // Convert tensor to array
    const embedding = Array.from(output.data) as number[];
    if (embedding.length > 0) {
      lastKnownDim = embedding.length;
    }

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
      const embedPipeline = await getPipeline();
      if (!embedPipeline) {
        continue;
      }

      // Truncate each text
      const truncatedBatch = batch.map(t => t.slice(0, 512));

      // Process batch
      const outputs = await Promise.all(
        truncatedBatch.map(text =>
          (embedPipeline as any)(text, { pooling: 'mean', normalize: true })
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
  const model = resolveActiveModel();
  if (!model) {
    return {
      available: false,
      error: 'SQUISH_LOCAL_MODEL is not configured',
    };
  }

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
  getModelId,
  getEmbedding,
  getBatchEmbeddings,
  checkHealth,
  unload,
  warmup,
};
