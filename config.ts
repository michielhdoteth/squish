import { join } from 'path';
import { mkdirSync, existsSync } from 'fs';

export function getDataDir(): string {
  const projectRoot = process.env.CLAUDE_WORKING_DIRECTORY || process.cwd();
  const dir = process.env.SQUISH_DATA_DIR || join(projectRoot, '.squish');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

const isTeamMode = !!process.env.DATABASE_URL?.startsWith('postgres');
const isManagedMode = process.env.SQUISH_MANAGED_MODE === 'true';
const openAiApiKey = process.env.SQUISH_OPENAI_API_KEY || process.env.OPENAI_API_KEY || '';

// Embeddings providers:
// - openai: OpenAI API (requires API key)
// - ollama: Local Ollama server (requires nomic-embed-text)
// - local: TF-IDF offline (no dependencies)
// - none: Disable embeddings (stub)
// - qmd: QMD (requires qmd CLI installed)
// - hybrid: Try multiple providers with fallbacks
// - google-multimodal: Google Cloud multimodal embeddings
const VALID_PROVIDERS = new Set(['openai', 'ollama', 'local', 'none', 'qmd', 'hybrid', 'google-multimodal', 'auto']);
const embeddingsProvider = (() => {
  const explicit = process.env.SQUISH_EMBEDDINGS_PROVIDER?.toLowerCase();
  if (explicit && VALID_PROVIDERS.has(explicit)) {
    return explicit;
  }
  return 'local';
})();

// QMD Integration
const qmdEnabled = process.env.SQUISH_QMD_ENABLED === 'true';
const qmdCollectionsPath = process.env.SQUISH_QMD_COLLECTIONS ||
  getDataDir().replace('.squish', 'qmd-collections');
const VALID_FALLBACK_MODES = new Set(['qmd-only', 'cloud-first', 'hybrid', 'local-only']);
const qmdFallbackMode = (() => {
  const mode = process.env.SQUISH_QMD_FALLBACK || 'hybrid';
  return VALID_FALLBACK_MODES.has(mode) ? mode : 'hybrid';
})();
const defaultCollectionMapping = {
  observation: 'squish-observations',
  fact: 'squish-facts',
  decision: 'squish-decisions',
  context: 'squish-context',
  preference: 'squish-preferences'
};
const qmdCollectionMapping = process.env.SQUISH_QMD_COLLECTION_MAPPING
  ? JSON.parse(process.env.SQUISH_QMD_COLLECTION_MAPPING)
  : defaultCollectionMapping;

export const config = {
  isTeamMode,
  isManagedMode,
  redisEnabled: !!process.env.REDIS_URL,
  dataDir: getDataDir(),
  
  mcpServerPort: parseInt(process.env.SQUISH_MCP_PORT || '8767'),
  mcpServerEnabled: process.env.SQUISH_MCP_SERVER_ENABLED !== 'false',
  
  embeddingsProvider: embeddingsProvider as 'openai' | 'ollama' | 'local' | 'none' | 'qmd' | 'hybrid' | 'google-multimodal' | 'auto',
  openAiApiKey,
  openAiApiUrl: process.env.SQUISH_OPENAI_API_URL || 'https://api.openai.com/v1/embeddings',
  openAiEmbeddingModel: process.env.SQUISH_OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small',
  ollamaUrl: process.env.SQUISH_OLLAMA_URL || 'http://localhost:11434',
  ollamaEmbeddingModel: process.env.SQUISH_OLLAMA_EMBEDDING_MODEL || 'nomic-embed-text:v1.5',

  // Lifecycle Management
  lifecycleEnabled: process.env.SQUISH_LIFECYCLE_ENABLED !== 'false',
  lifecycleInterval: parseInt(process.env.SQUISH_LIFECYCLE_INTERVAL || '3600000'),

  // Session Summarization
  summarizationEnabled: process.env.SQUISH_SUMMARIZATION_ENABLED !== 'false',
  incrementalThreshold: parseInt(process.env.SQUISH_INCREMENTAL_THRESHOLD || '10'),
  rollingWindowSize: parseInt(process.env.SQUISH_ROLLING_WINDOW_SIZE || '50'),

  // Agent-Aware Memory
  agentIsolationEnabled: process.env.SQUISH_AGENT_ISOLATION_ENABLED !== 'false',
  defaultVisibilityScope: (process.env.SQUISH_DEFAULT_VISIBILITY || 'private') as 'private' | 'project' | 'team' | 'global',

  // Memory Governance
  governanceEnabled: process.env.SQUISH_GOVERNANCE_ENABLED !== 'false',

  // Memory Consolidation
  consolidationEnabled: process.env.SQUISH_CONSOLIDATION_ENABLED === 'true',
  consolidationSimilarityThreshold: parseFloat(process.env.SQUISH_CONSOLIDATION_THRESHOLD || '0.8'),

  // QMD Integration
  qmdEnabled,
  qmdCollectionsPath,
  qmdFallbackMode: qmdFallbackMode as 'qmd-only' | 'cloud-first' | 'hybrid' | 'local-only',
  qmdCollectionMapping,

  // Google Cloud Multimodal Embeddings
  googleCloudApiKey: process.env.GOOGLE_CLOUD_API_KEY || process.env.SQUISH_GOOGLE_CLOUD_API_KEY || '',
  googleCloudProject: process.env.GOOGLE_CLOUD_PROJECT || process.env.SQUISH_GOOGLE_CLOUD_PROJECT || '',
  googleCloudLocation: process.env.GOOGLE_CLOUD_LOCATION || process.env.SQUISH_GOOGLE_CLOUD_LOCATION || 'us-central1',
  multimodalEmbeddingsEnabled: process.env.SQUISH_MULTIMODAL_EMBEDDINGS_ENABLED === 'true',

  // Managed Mode
  managedMode: process.env.SQUISH_MANAGED_MODE === 'true',
  managedApiUrl: process.env.SQUISH_MANAGED_API_URL || 'https://api.squish.dev',
  managedApiKey: process.env.SQUISH_MANAGED_API_KEY || '',

  // Session Auto-Load
  sessionAutoLoadEnabled: process.env.SQUISH_SESSION_AUTO_LOAD !== 'false',
  sessionAutoLoadRecentCount: parseInt(process.env.SQUISH_SESSION_AUTO_LOAD_RECENT_COUNT || '5'),
  sessionAutoLoadImportanceThreshold: parseInt(process.env.SQUISH_SESSION_AUTO_LOAD_IMPORTANCE_THRESHOLD || '70'),

  // Query Rewriting
  queryRewritingEnabled: process.env.SQUISH_QUERY_REWRITING !== 'false',
  queryRewritingContextMessages: parseInt(process.env.SQUISH_QUERY_REWRITING_CONTEXT_MESSAGES || '5'),
  queryRewritingFallbackEnabled: process.env.SQUISH_QUERY_REWRITING_FALLBACK !== 'false',

  // Feedback Tracking
  feedbackTrackingEnabled: process.env.SQUISH_FEEDBACK_TRACKING !== 'false',
  feedbackEchoBonus: parseInt(process.env.SQUISH_FEEDBACK_ECHO_BONUS || '10'),
  feedbackFizzlePenalty: parseInt(process.env.SQUISH_FEEDBACK_FIZZLE_PENALTY || '5'),

  // Scheduler
  schedulerMode: (process.env.SQUISH_SCHEDULER_MODE || 'cron') as 'cron' | 'interval' | 'heartbeat',
  cronEnabled: process.env.SQUISH_CRON_ENABLED !== 'false',
  heartbeatInterval: parseInt(process.env.SQUISH_HEARTBEAT_INTERVAL || '60000'),
  jobRetentionDays: parseInt(process.env.SQUISH_JOB_RETENTION_DAYS || '30'),

  // Core Memory
  coreMemoryTotalBytes: parseInt(process.env.SQUISH_CORE_MEMORY_TOTAL_BYTES || '16384'),
  coreMemorySectionBytes: parseInt(process.env.SQUISH_CORE_MEMORY_SECTION_BYTES || '4096'),

  // Embeddings Performance
  embeddingsTimeoutMs: parseInt(process.env.SQUISH_EMBEDDINGS_TIMEOUT_MS || '30000'),
  embeddingsMaxRetries: parseInt(process.env.SQUISH_EMBEDDINGS_MAX_RETRIES || '3'),
  embeddingsRetryDelayMs: parseInt(process.env.SQUISH_EMBEDDINGS_RETRY_DELAY_MS || '1000'),
  openAiTimeoutMs: parseInt(process.env.SQUISH_OPENAI_TIMEOUT_MS || process.env.SQUISH_EMBEDDINGS_TIMEOUT_MS || '30000'),
  ollamaTimeoutMs: parseInt(process.env.SQUISH_OLLAMA_TIMEOUT_MS || process.env.SQUISH_EMBEDDINGS_TIMEOUT_MS || '30000'),
  googleMultimodalTimeoutMs: parseInt(process.env.SQUISH_GOOGLE_MULTIMODAL_TIMEOUT_MS || process.env.SQUISH_EMBEDDINGS_TIMEOUT_MS || '30000'),
};

export default config;
