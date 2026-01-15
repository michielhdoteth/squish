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
export declare function generateEmbedding(text: string): Promise<Embedding>;
export declare function isEmbeddingAvailable(): Promise<boolean>;
export declare function getEmbeddingDimensions(): number;
export declare function serializeEmbedding(embedding: Embedding): Buffer;
export declare function deserializeEmbedding(buffer: Buffer): Embedding;
export declare function cosineSimilarity(a: Embedding, b: Embedding): number;
export declare function euclideanDistance(a: Embedding, b: Embedding): number;
export declare function findNearestNeighbors(query: Embedding, candidates: Array<{
    embedding: Embedding;
    id: string;
}>, k?: number): Array<{
    id: string;
    similarity: number;
}>;
//# sourceMappingURL=local-embeddings.d.ts.map