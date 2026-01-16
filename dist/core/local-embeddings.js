/**
 * Local Vector Embeddings Service
 * Provides local embedding generation without external APIs
 */
import { config } from '../config.js';
export const EMBEDDING_DIMENSIONS = 1536;
class StubEmbeddingProvider {
    async embed(_text) {
        return Array(EMBEDDING_DIMENSIONS).fill(0);
    }
    async isAvailable() {
        return true;
    }
    getDimensions() {
        return EMBEDDING_DIMENSIONS;
    }
}
class LocalTfidfEmbeddingProvider {
    idf = new Map();
    async embed(text) {
        const words = this.tokenize(text);
        const embedding = Array(EMBEDDING_DIMENSIONS).fill(0);
        const wordFreq = new Map();
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
    async isAvailable() {
        return true;
    }
    getDimensions() {
        return EMBEDDING_DIMENSIONS;
    }
    tokenize(text) {
        return text.toLowerCase().split(/\s+/).filter(w => w.length > 2).slice(0, 100);
    }
    hash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) - hash) + str.charCodeAt(i);
            hash = hash & hash;
        }
        return Math.abs(hash);
    }
}
let currentProvider = null;
export async function initializeEmbeddingProvider() {
    if (config.embeddingsProvider === 'openai' && config.openAiApiKey) {
        console.error('[squish] Using OpenAI embeddings (stub - not yet implemented)');
        currentProvider = new StubEmbeddingProvider();
    }
    else if (config.embeddingsProvider === 'ollama') {
        console.error('[squish] Using Ollama embeddings (stub - not yet implemented)');
        currentProvider = new StubEmbeddingProvider();
    }
    else {
        console.error('[squish] Using local TF-IDF embeddings (offline)');
        currentProvider = new LocalTfidfEmbeddingProvider();
    }
}
export async function generateEmbedding(text) {
    if (!currentProvider)
        await initializeEmbeddingProvider();
    return currentProvider?.embed(text) ?? Array(EMBEDDING_DIMENSIONS).fill(0);
}
export async function isEmbeddingAvailable() {
    if (!currentProvider)
        await initializeEmbeddingProvider();
    return currentProvider?.isAvailable() ?? false;
}
export function getEmbeddingDimensions() {
    return EMBEDDING_DIMENSIONS;
}
export function serializeEmbedding(embedding) {
    const buffer = Buffer.alloc(embedding.length * 4);
    for (let i = 0; i < embedding.length; i++) {
        buffer.writeFloatLE(embedding[i], i * 4);
    }
    return buffer;
}
export function deserializeEmbedding(buffer) {
    const embedding = [];
    for (let i = 0; i < buffer.length; i += 4) {
        embedding.push(buffer.readFloatLE(i));
    }
    return embedding;
}
export function cosineSimilarity(a, b) {
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
export function euclideanDistance(a, b) {
    if (a.length !== b.length) {
        throw new Error('Embeddings must have same dimensions');
    }
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
        const diff = a[i] - b[i];
        sum += diff * diff;
    }
    return Math.sqrt(sum);
}
export function findNearestNeighbors(query, candidates, k = 5) {
    return candidates
        .map(c => ({ id: c.id, similarity: cosineSimilarity(query, c.embedding) }))
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, k);
}
//# sourceMappingURL=local-embeddings.js.map