import { join } from 'path';
import { mkdirSync, existsSync } from 'fs';

export function getDataDir(): string {
  // Use project working directory, not user home directory
  const projectRoot = process.env.CLAUDE_WORKING_DIRECTORY || process.cwd();
  const dir = process.env.SQUISH_DATA_DIR || join(projectRoot, '.squish');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

const isTeamMode = !!process.env.DATABASE_URL?.startsWith('postgres');
const isManagedMode = process.env.SQUISH_MANAGED_MODE === 'true';
const openAiApiKey = process.env.SQUISH_OPENAI_API_KEY || process.env.OPENAI_API_KEY || '';

// Embeddings strategy:
// - Priority: QMD > Ollama (nomic-embed-text-v1.5) > OpenAI > Local TF-IDF
// - QMD provides hybrid BM25+vector+rerank search for best quality
// - Nomic provides excellent quality for memory systems with local inference
// - Local TF-IDF requires zero external dependencies (default for OpenClaw/VPS)
const VALID_PROVIDERS = new Set(['openai', 'ollama', 'local', 'none', 'qmd', 'hybrid']);
const embeddingsProvider = (() => {
  const explicit = process.env.SQUISH_EMBEDDINGS_PROVIDER?.toLowerCase();

  if (explicit && VALID_PROVIDERS.has(explicit)) {
    return explicit;
  }

  return 'local';
})();

// QMD Integration (v0.7.0)
const qmdEnabled = process.env.SQUISH_QMD_ENABLED === 'true';
const qmdCollectionsPath = process.env.SQUISH_QMD_COLLECTIONS ||
  getDataDir().replace('.squish', 'qmd-collections');
const VALID_FALLBACK_MODES = new Set(['qmd-only', 'cloud-first', 'hybrid', 'local-only']);
const qmdFallbackMode = (() => {
  const mode = process.env.SQUISH_QMD_FALLBACK || 'hybrid';
  return VALID_FALLBACK_MODES.has(mode) ? mode : 'hybrid';
})();

// Default collection mapping for memory types
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
  
  // MCP Server
  mcpServerPort: parseInt(process.env.SQUISH_MCP_PORT || '8767'),
  mcpServerEnabled: process.env.SQUISH_MCP_SERVER_ENABLED !== 'false',
  
  embeddingsProvider: (VALID_PROVIDERS.has(embeddingsProvider) ? embeddingsProvider : 'local') as 'openai' | 'ollama' | 'local' | 'none' | 'qmd' | 'hybrid' | 'google-multimodal',
  openAiApiKey,
  openAiApiUrl: process.env.SQUISH_OPENAI_API_URL || 'https://api.openai.com/v1/embeddings',
  openAiEmbeddingModel: process.env.SQUISH_OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small',
  ollamaUrl: process.env.SQUISH_OLLAMA_URL || 'http://localhost:11434',
  ollamaEmbeddingModel: process.env.SQUISH_OLLAMA_EMBEDDING_MODEL || 'nomic-embed-text:v1.5',

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

  // v0.7.0: QMD Integration (OPT-IN, DEFAULT OFF)
  qmdEnabled,
  qmdCollectionsPath,
  qmdFallbackMode: qmdFallbackMode as 'qmd-only' | 'cloud-first' | 'hybrid' | 'local-only',
  qmdCollectionMapping,

  // v0.9.0: Google Cloud Multimodal Embeddings
  googleCloudApiKey: process.env.GOOGLE_CLOUD_API_KEY || process.env.SQUISH_GOOGLE_CLOUD_API_KEY || '',
  googleCloudProject: process.env.GOOGLE_CLOUD_PROJECT || process.env.SQUISH_GOOGLE_CLOUD_PROJECT || '',
  googleCloudLocation: process.env.GOOGLE_CLOUD_LOCATION || process.env.SQUISH_GOOGLE_CLOUD_LOCATION || 'us-central1',
  multimodalEmbeddingsEnabled: process.env.SQUISH_MULTIMODAL_EMBEDDINGS_ENABLED === 'true',

  // v0.9.0: Managed Mode (Squish Cloud)
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

   // Echo/Fizzle Tracking
   feedbackTrackingEnabled: process.env.SQUISH_FEEDBACK_TRACKING !== 'false',
   feedbackEchoBonus: parseInt(process.env.SQUISH_FEEDBACK_ECHO_BONUS || '10'),
   feedbackFizzlePenalty: parseInt(process.env.SQUISH_FEEDBACK_FIZZLE_PENALTY || '5'),

   // Scheduled Maintenance
   schedulerMode: (process.env.SQUISH_SCHEDULER_MODE || 'cron') as 'cron' | 'interval' | 'heartbeat',
   cronEnabled: process.env.SQUISH_CRON_ENABLED !== 'false',
   heartbeatInterval: parseInt(process.env.SQUISH_HEARTBEAT_INTERVAL || '60000'),
   jobRetentionDays: parseInt(process.env.SQUISH_JOB_RETENTION_DAYS || '30'),

   // Core Memory Configuration (v0.9.2+)
   coreMemoryTotalBytes: parseInt(process.env.SQUISH_CORE_MEMORY_TOTAL_BYTES || '16384'), // 16KB default
   coreMemorySectionBytes: parseInt(process.env.SQUISH_CORE_MEMORY_SECTION_BYTES || '4096'), // 4KB default per section

   // Embeddings Performance & Reliability
   embeddingsTimeoutMs: parseInt(process.env.SQUISH_EMBEDDINGS_TIMEOUT_MS || '30000'), // 30s default
   embeddingsMaxRetries: parseInt(process.env.SQUISH_EMBEDDINGS_MAX_RETRIES || '3'),
   embeddingsRetryDelayMs: parseInt(process.env.SQUISH_EMBEDDINGS_RETRY_DELAY_MS || '1000'),
   // Per-provider timeout overrides
   openAiTimeoutMs: parseInt(process.env.SQUISH_OPENAI_TIMEOUT_MS || process.env.SQUISH_EMBEDDINGS_TIMEOUT_MS || '30000'),
   ollamaTimeoutMs: parseInt(process.env.SQUISH_OLLAMA_TIMEOUT_MS || process.env.SQUISH_EMBEDDINGS_TIMEOUT_MS || '30000'),
   googleMultimodalTimeoutMs: parseInt(process.env.SQUISH_GOOGLE_MULTIMODAL_TIMEOUT_MS || process.env.SQUISH_EMBEDDINGS_TIMEOUT_MS || '30000'),
 };

export default config;
