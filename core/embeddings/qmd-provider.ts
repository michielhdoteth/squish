/**
 * QMD Embedding Provider
 *
 * Uses QMD's local embedding model (EmbeddingGemma-300M) for generating
 * vector embeddings. This provides a local-only option for semantic search.
 *
 * Note: QMD doesn't directly expose an embedding generation endpoint via MCP.
 * This provider is a placeholder for future direct embedding integration.
 *
 * For now, the main value of QMD integration is through the hybrid search
 * capabilities (qmd_search, qmd_vsearch, qmd_query) rather than direct
 * embedding generation.
 *
 * Current approach:
 * - Use QMD's search tools for hybrid retrieval
 * - Use Squish's existing embedding providers for storage
 * - Future: Direct embedding generation via node-llama-cpp
 */

import { getQMDClient } from './qmd-client.js';
import { logger } from '../logger.js';

export interface QMDEmbeddingConfig {
  enabled: boolean;
  fallbackToCloud: boolean;
  minConfidence: number;
}

export class QMDEmbeddingProvider {
  private config: QMDEmbeddingConfig;
  private initialized = false;
  private available = false;

  constructor(config: QMDEmbeddingConfig) {
    this.config = config;
  }

  async initialize(): Promise<boolean> {
    if (this.initialized) {
      return this.available;
    }

    this.initialized = true;

    try {
      const client = await getQMDClient();
      this.available = await client.isAvailable();

      if (this.available) {
        logger.info('QMD embedding provider initialized');
        return true;
      } else if (this.config.fallbackToCloud) {
        logger.warn('QMD unavailable, will fallback to cloud providers');
        return false;
      } else {
        logger.error('QMD unavailable and fallback disabled');
        return false;
      }
    } catch (error) {
      logger.error(`QMD initialization failed: ${error}`);
      if (!this.config.fallbackToCloud) {
        throw error;
      }
      return false;
    }
  }

  /**
   * Generate embedding for text
   *
   * Note: QMD's MCP server doesn't expose a direct embedding endpoint.
   * The search tools (qmd_search, qmd_vsearch, qmd_query) use embeddings internally
   * but don't return them.
   *
   * For direct embedding generation, we would need to:
   * 1. Use node-llama-cpp directly with EmbeddingGemma-300M model
   * 2. Or use QMD's internal API (not exposed via MCP)
   *
   * For now, this returns null to trigger fallback to other providers.
   *
   * @param text - Text to embed
   * @returns Embedding vector or null (triggers fallback)
   */
  async embed(text: string): Promise<number[] | null> {
    if (!this.available) {
      await this.initialize();
    }

    if (!this.available) {
      return null;
    }

    try {
      // QMD doesn't expose direct embedding generation via MCP
      // The search tools use embeddings but don't return them
      //
      // Future implementation options:
      // 1. Add node-llama-cpp as dependency and call EmbeddingGemma directly
      // 2. Use QMD's HTTP API if available
      // 3. Store embeddings returned from search results
      //
      // For now, return null to use fallback providers
      logger.debug('QMD direct embedding not available, using fallback');
      return null;
    } catch (error) {
      logger.warn(`QMD embedding failed: ${error}`);
      return null;
    }
  }

  /**
   * Check if QMD is available
   */
  async isAvailable(): Promise<boolean> {
    if (!this.initialized) {
      await this.initialize();
    }
    return this.available;
  }

  /**
   * Get embedding dimensions
   * QMD uses 768-dim embeddings (EmbeddingGemma-300M)
   */
  getDimensions(): number {
    return 768;
  }

  /**
   * Reset the provider state
   */
  reset(): void {
    this.initialized = false;
    this.available = false;
  }
}

/**
 * Create a QMD embedding provider with default config
 */
export function createQMDEmbeddingProvider(config?: Partial<QMDEmbeddingConfig>): QMDEmbeddingProvider {
  return new QMDEmbeddingProvider({
    enabled: true,
    fallbackToCloud: true,
    minConfidence: 0.5,
    ...config
  });
}
