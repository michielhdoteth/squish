// Type declarations for core/embeddings.js barrel re-export
export type { EmbeddingProvider } from './embeddings/embeddings';
export { getEmbedding, getBatchEmbeddings, clearEmbeddingCache, getEmbeddingCacheStats, checkEmbeddingProviderHealth } from './embeddings/embeddings';
export { getActiveEmbeddingModelId, getActiveEmbeddingDim, ensureLocalModelReady, TFIDF_MODEL_ID } from './embeddings/embeddings';

export type { MultimodalInput, GoogleMultimodalResponse } from './embeddings/google-multimodal';
export { getGoogleMultimodalEmbedding, isMultimodalInput } from './embeddings/google-multimodal';

export { cosineSimilarity } from './embeddings/local-embeddings';
