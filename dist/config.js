import { homedir } from 'os';
import { join } from 'path';
import { mkdirSync, existsSync } from 'fs';
export function getDataDir() {
    const dir = process.env.SQUISH_DATA_DIR || join(homedir(), '.squish');
    if (!existsSync(dir))
        mkdirSync(dir, { recursive: true });
    return dir;
}
const openAiApiKey = process.env.SQUISH_OPENAI_API_KEY || process.env.OPENAI_API_KEY || '';
const embeddingsProvider = (process.env.SQUISH_EMBEDDINGS_PROVIDER || (openAiApiKey ? 'openai' : 'none')).toLowerCase();
export const config = {
    isTeamMode: !!process.env.DATABASE_URL?.startsWith('postgres'),
    redisEnabled: !!process.env.REDIS_URL,
    dataDir: getDataDir(),
    embeddingsProvider: (['openai', 'ollama', 'none'].includes(embeddingsProvider) ? embeddingsProvider : 'none'),
    openAiApiKey,
    openAiApiUrl: process.env.SQUISH_OPENAI_API_URL || 'https://api.openai.com/v1/embeddings',
    openAiEmbeddingModel: process.env.SQUISH_OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small',
    ollamaUrl: process.env.SQUISH_OLLAMA_URL || 'http://localhost:11434',
    ollamaEmbeddingModel: process.env.SQUISH_OLLAMA_EMBEDDING_MODEL || 'nomic-embed-text',
};
export default config;
//# sourceMappingURL=config.js.map