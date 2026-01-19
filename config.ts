import { homedir } from 'os';
import { join } from 'path';
import { mkdirSync, existsSync } from 'fs';

export function getDataDir(): string {
  const dir = process.env.SQUISH_DATA_DIR || join(homedir(), '.squish');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

const isTeamMode = !!process.env.DATABASE_URL?.startsWith('postgres');
const openAiApiKey = process.env.SQUISH_OPENAI_API_KEY || process.env.OPENAI_API_KEY || '';

// Embeddings strategy:
// - SQLite (local): Use local TF-IDF (no API key needed)
// - PostgreSQL (team): Allow OpenAI or Ollama (requires API key)
const embeddingsProvider = (() => {
  const explicit = process.env.SQUISH_EMBEDDINGS_PROVIDER?.toLowerCase();

  // If explicitly set, respect the user's choice
  if (explicit && ['openai', 'ollama', 'local', 'none'].includes(explicit)) {
    return explicit;
  }

  // For team mode (PostgreSQL), default to OpenAI if API key exists, otherwise none
  if (isTeamMode) {
    return openAiApiKey ? 'openai' : 'none';
  }

  // For local mode (SQLite), always use local TF-IDF embeddings (no API key needed)
  return 'local';
})();

export const config = {
  isTeamMode,
  redisEnabled: !!process.env.REDIS_URL,
  dataDir: getDataDir(),
  embeddingsProvider: (['openai', 'ollama', 'local', 'none'].includes(embeddingsProvider) ? embeddingsProvider : 'local') as 'openai' | 'ollama' | 'local' | 'none',
  openAiApiKey,
  openAiApiUrl: process.env.SQUISH_OPENAI_API_URL || 'https://api.openai.com/v1/embeddings',
  openAiEmbeddingModel: process.env.SQUISH_OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small',
  ollamaUrl: process.env.SQUISH_OLLAMA_URL || 'http://localhost:11434',
  ollamaEmbeddingModel: process.env.SQUISH_OLLAMA_EMBEDDING_MODEL || 'nomic-embed-text',

  // v0.3.0: Lifecycle Management (DEFAULT ON)
  lifecycleEnabled: process.env.SQUISH_LIFECYCLE_ENABLED !== 'false',
  lifecycleInterval: parseInt(process.env.SQUISH_LIFECYCLE_INTERVAL || '3600000'), // 1 hour

  // v0.3.0: Session Summarization (DEFAULT ON)
  summarizationEnabled: process.env.SQUISH_SUMMARIZATION_ENABLED !== 'false',
  incrementalThreshold: parseInt(process.env.SQUISH_INCREMENTAL_THRESHOLD || '10'),
  rollingWindowSize: parseInt(process.env.SQUISH_ROLLING_WINDOW_SIZE || '50'),

  // v0.3.0: Agent-Aware Memory (DEFAULT ON)
  agentIsolationEnabled: process.env.SQUISH_AGENT_ISOLATION_ENABLED !== 'false',
  defaultVisibilityScope: (process.env.SQUISH_DEFAULT_VISIBILITY || 'private') as 'private' | 'project' | 'team' | 'global',

  // v0.3.0: Memory Governance (DEFAULT ON)
  governanceEnabled: process.env.SQUISH_GOVERNANCE_ENABLED !== 'false',

  // v0.3.0: Memory Consolidation (OPT-IN, DEFAULT OFF)
  consolidationEnabled: process.env.SQUISH_CONSOLIDATION_ENABLED === 'true',
  consolidationSimilarityThreshold: parseFloat(process.env.SQUISH_CONSOLIDATION_THRESHOLD || '0.8'),
};

export default config;
