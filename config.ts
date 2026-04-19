import { join } from 'path';
import { mkdirSync, existsSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export function getDataDir(): string {
  const projectRoot = process.env.CLAUDE_WORKING_DIRECTORY || process.cwd();
  const dir = process.env.SQUISH_DATA_DIR || join(projectRoot, '.squish');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

// Load settings from config/settings.json
function loadSettings(): any {
  const settingsPath = join(__dirname, 'config', 'settings.json');
  try {
    if (existsSync(settingsPath)) {
      const content = readFileSync(settingsPath, 'utf-8');
      return JSON.parse(content);
    }
  } catch (error) {
    console.warn('Failed to load settings.json, using defaults');
  }
  return {};
}

const settings = loadSettings();

// Helper to get env var or settings value
function getConfig(path: string, envVar: string | null, defaultValue: any): any {
  // Priority 1: Environment variable
  if (envVar && process.env[envVar]) {
    return process.env[envVar];
  }
  
  // Priority 2: Settings file
  const keys = path.split('.');
  let value = settings;
  for (const key of keys) {
    if (value && typeof value === 'object' && key in value) {
      value = value[key];
    } else {
      value = undefined;
      break;
    }
  }
  
  if (value !== undefined) {
    return value;
  }
  
  // Priority 3: Default value
  return defaultValue;
}

// Mode detection: local (default), team (cloud with own db), remote (integrations)
// Priority: remote > team > local
const DATABASE_URL = process.env.DATABASE_URL || '';
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const NEON_PROJECT_ID = process.env.NEON_PROJECT_ID || '';

// Determine mode based on environment
function detectMode(): 'local' | 'team' | 'remote' {
  // Remote mode: user has their own Supabase or Neon
  if (SUPABASE_URL || NEON_PROJECT_ID) {
    return 'remote';
  }
  // Team mode: PostgreSQL (self-hosted "local cloud")
  if (DATABASE_URL.startsWith('postgres')) {
    return 'team';
  }
  // Local mode: default SQLite
  return 'local';
}

const detectedMode = detectMode();
const isTeamMode = detectedMode === 'team';
const isRemoteMode = detectedMode === 'remote';
const isLocalMode = detectedMode === 'local';

const isManagedMode = process.env.SQUISH_MANAGED_MODE === 'true';

// Team/Remote backend selection
const teamBackend = (() => {
  const explicit = getConfig('team.backend', 'SQUISH_TEAM_BACKEND', '').toLowerCase();
  if (explicit === 'supabase' || explicit === 'neon' || explicit === 'postgres') {
    return explicit;
  }
  // Auto-detect based on env vars
  if (SUPABASE_URL) return 'supabase';
  if (NEON_PROJECT_ID) return 'neon';
  return 'postgres'; // default to PostgreSQL
})();

const remoteBackend = (() => {
  const explicit = getConfig('remote.backend', 'SQUISH_REMOTE_BACKEND', '').toLowerCase();
  if (explicit === 'supabase' || explicit === 'neon') {
    return explicit;
  }
  // Auto-detect based on env vars
  if (SUPABASE_URL) return 'supabase';
  if (NEON_PROJECT_ID) return 'neon';
  return 'supabase'; // default to Supabase
})();

// Neon configuration
const neonProjectId = process.env.NEON_PROJECT_ID || '';
const neonServiceKey = process.env.NEON_SERVICE_KEY || '';

// Embeddings providers:
// - openai: OpenAI API (requires API key)
// - ollama: Local Ollama server (any model)
// - lmstudio: LM Studio local server (any model)
// - transformers: Transformers.js local (all-MiniLM-L6-v2, ONNX-based)
// - local: TF-IDF offline (no dependencies)
// - none: Disable embeddings (stub)
// - google: Google Cloud embeddings
// - auto: Smart fallback (cloud -> transformers -> TF-IDF)
const VALID_PROVIDERS = new Set(['openai', 'ollama', 'lmstudio', 'transformers', 'local', 'none', 'google', 'auto']);
const embeddingsProvider = (() => {
  const explicit = getConfig('embeddings.provider', 'SQUISH_EMBEDDINGS_PROVIDER', 'local').toLowerCase();
  if (VALID_PROVIDERS.has(explicit)) {
    return explicit;
  }
  return 'local';
})();

// OpenAI Configuration
const openAiApiKey = process.env.SQUISH_OPENAI_API_KEY || process.env.OPENAI_API_KEY || '';
const openAiApiUrl = getConfig('api.openai.apiUrl', 'SQUISH_OPENAI_API_URL', 'https://api.openai.com/v1/embeddings');
const openAiEmbeddingModel = getConfig('embeddings.models.openai.model', 'SQUISH_OPENAI_EMBEDDING_MODEL', 'text-embedding-3-small');

// Google Configuration  
const googleCloudApiKey = process.env.GOOGLE_CLOUD_API_KEY || process.env.SQUISH_GOOGLE_CLOUD_API_KEY || '';
const googleCloudProject = process.env.GOOGLE_CLOUD_PROJECT || process.env.SQUISH_GOOGLE_CLOUD_PROJECT || '';
const googleCloudLocation = process.env.GOOGLE_CLOUD_LOCATION || process.env.SQUISH_GOOGLE_CLOUD_LOCATION || 'us-central1';
const googleEmbeddingModel = getConfig('embeddings.models.google.model', 'SQUISH_GOOGLE_EMBEDDING_MODEL', 'gemini-embedding-001');

// Ollama Configuration
const ollamaUrl = getConfig('api.ollama.url', 'SQUISH_OLLAMA_URL', 'http://localhost:11434');
const ollamaEmbeddingModel = getConfig('embeddings.models.ollama.model', 'SQUISH_OLLAMA_EMBEDDING_MODEL', '');

// LM Studio Configuration (OpenAI-compatible local server)
const lmStudioUrl = getConfig('api.lmstudio.url', 'SQUISH_LM_STUDIO_URL', 'http://localhost:1234');
const lmStudioEmbeddingModel = getConfig('embeddings.models.lmstudio.model', 'SQUISH_LM_STUDIO_EMBEDDING_MODEL', '');

// Transformers.js Local Configuration (ONNX-based model)
const transformersLocalModel = getConfig('embeddings.models.transformers.model', 'SQUISH_LOCAL_MODEL', 'onnx-community/all-MiniLM-L6-v2-ONNX');

export const config = {
  // Mode detection
  mode: detectedMode,
  isLocalMode,
  isTeamMode,
  isRemoteMode,
  
  // Backend selection
  teamBackend: teamBackend as 'postgres' | 'supabase' | 'neon',
  remoteBackend: remoteBackend as 'supabase' | 'neon',
  
  // Legacy support
  isManagedMode,
  redisEnabled: !!process.env.REDIS_URL,
  dataDir: getDataDir(),
  
  mcpServerPort: parseInt(getConfig('mcp.serverPort', 'SQUISH_MCP_PORT', '8767')),
  
embeddingsProvider: embeddingsProvider as 'local' | 'openai' | 'ollama' | 'lmstudio' | 'transformers' | 'google' | 'none' | 'auto',

  // OpenAI
  openAiApiKey,
  openAiApiUrl,
  openAiEmbeddingModel,

  // Google
  googleCloudApiKey,
  googleCloudProject,
  googleCloudLocation,
  googleEmbeddingModel,

  // Ollama
  ollamaUrl,
  ollamaEmbeddingModel,

  // LM Studio (OpenAI-compatible local)
  lmStudioUrl,
  lmStudioEmbeddingModel,

  // Transformers.js local (ONNX-based)
  transformersLocalModel,

  // Supabase configuration
  supabaseUrl: getConfig('supabase.url', 'SUPABASE_URL', ''),
  supabaseKey: getConfig('supabase.key', 'SUPABASE_SERVICE_KEY', ''),

  // Neon configuration
  neonProjectId: process.env.NEON_PROJECT_ID || '',
  neonServiceKey: process.env.NEON_SERVICE_KEY || '',

  // Encryption configuration
  clientEncryptionEnabled: getConfig('security.encryptionEnabled', null, false) !== false,
  encryptionPassphrase: process.env.SQUISH_ENCRYPTION_PASSPHRASE || '',

  // Lifecycle Management
  lifecycleEnabled: getConfig('features.lifecycleEnabled', 'SQUISH_LIFECYCLE_ENABLED', true) !== false,
  lifecycleInterval: parseInt(process.env.SQUISH_LIFECYCLE_INTERVAL || '3600000'),
  decayThreshold: parseFloat(process.env.SQUISH_DECAY_THRESHOLD || '0.1'),
  sectorDecayIntervals: {
    episodic: parseInt(process.env.SQUISH_DECAY_EPISODIC || '30'),
    semantic: parseInt(process.env.SQUISH_DECAY_SEMANTIC || '90'),
    procedural: parseInt(process.env.SQUISH_DECAY_PROCEDURAL || '180'),
    autobiographical: parseInt(process.env.SQUISH_DECAY_AUTOBIOGRAPHICAL || '365'),
    working: parseInt(process.env.SQUISH_DECAY_WORKING || '7'),
  },

  // Session Summarization
  summarizationEnabled: getConfig('features.summarizationEnabled', 'SQUISH_SUMMARIZATION_ENABLED', true) !== false,
  incrementalThreshold: parseInt(process.env.SQUISH_INCREMENTAL_THRESHOLD || '10'),
  rollingWindowSize: parseInt(process.env.SQUISH_ROLLING_WINDOW_SIZE || '50'),

  // Agent-Aware Memory
  agentIsolationEnabled: getConfig('features.agentIsolation', 'SQUISH_AGENT_ISOLATION_ENABLED', true) !== false,
  defaultVisibilityScope: (process.env.SQUISH_DEFAULT_VISIBILITY || 'private') as 'private' | 'project' | 'team' | 'global',

  // Memory Governance
  governanceEnabled: process.env.SQUISH_GOVERNANCE_ENABLED !== 'false',

  // Memory Consolidation
  consolidationEnabled: process.env.SQUISH_CONSOLIDATION_ENABLED === 'true',
  consolidationSimilarityThreshold: parseFloat(process.env.SQUISH_CONSOLIDATION_THRESHOLD || '0.8'),

  // Obsidian Integration (NEW)
  obsidianEnabled: process.env.SQUISH_OBSIDIAN_ENABLED === 'true',
  obsidianVaultPath: process.env.SQUISH_OBSIDIAN_VAULT_PATH || '',

  // External Folder Memory
  externalMemoryEnabled: process.env.SQUISH_EXTERNAL_MEMORY_ENABLED === 'true',
  externalMemoryPath: process.env.SQUISH_EXTERNAL_MEMORY_PATH || '',

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

  // Scoring Weights (override defaults)
  scoringWeights: {
    recency: parseFloat(process.env.SQUISH_WEIGHT_RECENCY || '0.5'),
    relevance: parseFloat(process.env.SQUISH_WEIGHT_RELEVANCE || '3'),
    importance: parseFloat(process.env.SQUISH_WEIGHT_IMPORTANCE || '2'),
    vectorSim: parseFloat(process.env.SQUISH_WEIGHT_VECTOR_SIM || '3'),
    graphBoost: parseFloat(process.env.SQUISH_WEIGHT_GRAPH_BOOST || '1.5'),
  },

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
  googleTimeoutMs: parseInt(process.env.SQUISH_GOOGLE_TIMEOUT_MS || process.env.SQUISH_EMBEDDINGS_TIMEOUT_MS || '30000'),
};

export default config;
