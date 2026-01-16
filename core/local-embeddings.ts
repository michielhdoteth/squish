/**
 * Local Vector Embeddings Service
 * Provides local embedding generation without external APIs
 */

import { config } from '../config.js';

export type Embedding = number[];

export const EMBEDDING_DIMENSIONS = 1536;

export interface EmbeddingProvider {
  embed(text: string): Promise<Embedding>;
  isAvailable(): Promise<boolean>;
  getDimensions(): number;
}

class StubEmbeddingProvider implements EmbeddingProvider {
  async embed(_text: string): Promise<Embedding> {
    return Array(EMBEDDING_DIMENSIONS).fill(0);
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }

  getDimensions(): number {
    return EMBEDDING_DIMENSIONS;
  }
}

class LocalTfidfEmbeddingProvider implements EmbeddingProvider {
  private idf = new Map<string, number>();

  async embed(text: string): Promise<Embedding> {
    const words = this.tokenize(text);
    const embedding = Array(EMBEDDING_DIMENSIONS).fill(0);
    const wordFreq = new Map<string, number>();

    for (const word of words) {
      wordFreq.set(word, (wordFreq.get(word) || 0) + 1);
    }

    for (const [word, freq] of wordFreq.entries()) {
      const hash = this.hash(word) % EMBEDDING_DIMENSIONS;
      const idf = this.idf.get(word) || 1;
      embedding[hash] += freq * idf;
    }

    const norm = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    if (norm > 0) {
      for (let i = 0; i < embedding.length; i++) {
        embedding[i] /= norm;
      }
    }

    return embedding;
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }

  getDimensions(): number {
    return EMBEDDING_DIMENSIONS;
  }

  private tokenize(text: string): string[] {
    return text.toLowerCase().split(/\s+/).filter(w => w.length > 2).slice(0, 100);
  }

  private hash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash = hash & hash;
    }
    return Math.abs(hash);
  }
}

let currentProvider: EmbeddingProvider | null = null;

export async function initializeEmbeddingProvider(): Promise<void> {
  if (config.embeddingsProvider === 'openai' && config.openAiApiKey) {
    console.error('[squish] Using OpenAI embeddings (stub - not yet implemented)');
    currentProvider = new StubEmbeddingProvider();
  } else if (config.embeddingsProvider === 'ollama') {
    console.error('[squish] Using Ollama embeddings (stub - not yet implemented)');
    currentProvider = new StubEmbeddingProvider();
  } else {
    console.error('[squish] Using local TF-IDF embeddings (offline)');
    currentProvider = new LocalTfidfEmbeddingProvider();
  }
}











export function cosineSimilarity(a: Embedding, b: Embedding): number {
  if (a.length !== b.length) {
    throw new Error('Embeddings must have same dimensions');
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dotProduct / denominator;
}




