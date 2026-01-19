/**
 * Local Vector Embeddings Service
 * Provides local embedding generation without external APIs
 */
export type Embedding = number[];
export declare const EMBEDDING_DIMENSIONS = 1536;
export interface EmbeddingProvider {
    embed(text: string): Promise<Embedding>;
    isAvailable(): Promise<boolean>;
    getDimensions(): number;
}
export declare function initializeEmbeddingProvider(): Promise<void>;
export declare function cosineSimilarity(a: Embedding, b: Embedding): number;
//# sourceMappingURL=local-embeddings.d.ts.map