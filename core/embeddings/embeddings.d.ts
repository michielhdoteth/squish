import { MultimodalInput } from './google-multimodal.js';
export type EmbeddingProvider = 'local' | 'openai' | 'ollama' | 'lmstudio' | 'transformers' | 'google' | 'none' | 'auto';
export declare function getEmbedding(input: string | MultimodalInput): Promise<number[] | null>;
/**
 * Get embeddings for multiple inputs in parallel batches
 * Processes inputs in batches to respect rate limits while parallelizing
 */
export declare function getBatchEmbeddings(inputs: string[], batchSize?: number): Promise<Array<number[] | null>>;
/**
 * Clear the embedding cache
 */
export declare function clearEmbeddingCache(): void;
/**
 * Get embedding cache statistics
 */
export declare function getEmbeddingCacheStats(): {
    size: number;
    maxSize: number;
};
/**
 * Check health of all configured embedding providers
 * Returns availability and latency for each provider
 */
export declare function checkEmbeddingProviderHealth(): Promise<Map<string, {
    available: boolean;
    latencyMs?: number;
    error?: string;
}>>;
//# sourceMappingURL=embeddings.d.ts.map