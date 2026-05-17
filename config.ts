import { isAbsolute, join, resolve, parse as parsePath } from 'path';
import { mkdirSync, existsSync, readFileSync } from 'fs';
import { homedir } from 'os';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

type Settings = Record<string, unknown>;

const EMBEDDINGS_PROVIDERS = ['openai', 'ollama', 'lmstudio', 'transformers', 'local', 'none', 'google', 'auto'] as const;
const LLM_PROVIDERS = ['openai', 'anthropic', 'ollama', 'lmstudio', 'local'] as const;
const GRAPH_EXTRACTION_METHODS = ['llm', 'regex', 'auto'] as const;
const SCHEDULER_MODES = ['cron', 'interval', 'heartbeat'] as const;
const VISIBILITY_SCOPES = ['private', 'project', 'team', 'global'] as const;
const DECAY_ENGINES = ['sector', 'ebbinghaus'] as const;

function loadSettings(): Settings {
  const settingsPath = join(__dirname, 'config', 'settings.json');
  try {
    if (existsSync(settingsPath)) {
      return JSON.parse(readFileSync(settingsPath, 'utf-8'));
    }
  } catch {
    console.warn('Failed to load settings.json, using defaults');
  }
  return {};
}

const settings = loadSettings();

function readPath(path: string): unknown {
  let value: unknown = settings;
  for (const key of path.split('.')) {
    if (value && typeof value === 'object' && key in value) {
      value = (value as Record<string, unknown>)[key];
    } else {
      return undefined;
    }
  }
  return value;
}

function rawConfig(path: string, envVar: string | null, defaultValue: unknown): unknown {
  if (envVar && Object.prototype.hasOwnProperty.call(process.env, envVar)) {
    return process.env[envVar];
  }
  const settingsValue = readPath(path);
  return settingsValue === undefined ? defaultValue : settingsValue;
}

function getString(path: string, envVar: string | null, defaultValue: string): string {
  const value = rawConfig(path, envVar, defaultValue);
  return typeof value === 'string' ? value : String(value ?? defaultValue);
}

function getBoolean(path: string, envVar: string | null, defaultValue: boolean): boolean {
  const value = rawConfig(path, envVar, defaultValue);
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'off', ''].includes(normalized)) return false;
  }
  return defaultValue;
}

function getNumber(path: string, envVar: string | null, defaultValue: number): number {
  const value = rawConfig(path, envVar, defaultValue);
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

function getEnum<T extends readonly string[]>(
  path: string,
  envVar: string | null,
  allowed: T,
  defaultValue: T[number]
): T[number] {
  const value = getString(path, envVar, defaultValue).toLowerCase();
  return allowed.includes(value) ? value : defaultValue;
}

/**
 * Detects the current project root directory.
 * Uses a unified WORKING_DIRECTORY approach - all agents set the same thing.
 * Priority: SQUISH_WORKING_DIRECTORY > INIT_CWD > cwd
 */
function detectProjectRoot(): string {
  return process.env.SQUISH_WORKING_DIRECTORY
    ?? process.env.INIT_CWD
    ?? process.cwd();
}

/**
 * Detects the current project scope for MemoryScope auto-filtering.
 * Returns project path or null if truly global (no project context).
 * Used by rememberMemory() and search() to auto-scope when no --project given.
 */
export function detectProjectScope(): string | null {
  const root = detectProjectRoot();
  // Only return a scope if we have meaningful project context
  return root || null;
}

/**
 * Returns the global data directory path (~/.squish/)
 */
export function globalDataDir(): string {
  return join(homedir(), '.squish');
}

/**
 * Returns the global ~/.squish/ directory.
 * No per-project .squish/ directories -- all memory is global.
 */
export function findSquishDir(_startPath?: string): string {
  return globalDataDir();
}

export function findAllSquishDirs(_startPath?: string): string[] {
  return [globalDataDir()];
}

export function getDataDir(): string {
  // 1. If SQUISH_DATA_DIR is explicitly set, use it
  if (process.env.SQUISH_DATA_DIR) {
    const dir = isAbsolute(process.env.SQUISH_DATA_DIR)
      ? process.env.SQUISH_DATA_DIR
      : resolve(process.cwd(), process.env.SQUISH_DATA_DIR);
    if (!existsSync(dir)) {
      try {
        mkdirSync(dir, { recursive: true });
      } catch (err: any) {
        if (err.code === 'EPERM' || err.code === 'EACCES') {
          const fallbackDir = globalDataDir();
          if (!existsSync(fallbackDir)) mkdirSync(fallbackDir, { recursive: true });
          console.warn(`Warning: no permission to create ${dir}, using ${fallbackDir}`);
          return fallbackDir;
        }
        throw err;
      }
    }
    return dir;
  }

  // 2. Check settings.json for data.dir
  const projectRoot = detectProjectRoot();
  const settingsDir = readPath('data.dir');
  if (typeof settingsDir === 'string' && settingsDir.length > 0) {
    const dir = isAbsolute(settingsDir) ? settingsDir : resolve(projectRoot, settingsDir);
    if (!existsSync(dir)) {
      try {
        mkdirSync(dir, { recursive: true });
      } catch {
        // fall through to default
      }
    }
    if (existsSync(dir)) return dir;
  }

  // 4. Default to global ~/.squish/
  const global = globalDataDir();
  if (!existsSync(global)) {
    try {
      mkdirSync(global, { recursive: true });
    } catch (err: any) {
      if (err.code === 'EPERM' || err.code === 'EACCES') {
        console.warn(`Warning: no permission to create ${global}`);
      }
      throw err;
    }
  }
  return global;
}

function resolveDataDir(): string {
  // Match the same priority as getDataDir but don't create dirs
  if (process.env.SQUISH_DATA_DIR) {
    const dir = isAbsolute(process.env.SQUISH_DATA_DIR)
      ? process.env.SQUISH_DATA_DIR
      : resolve(process.cwd(), process.env.SQUISH_DATA_DIR);
    return dir;
  }

  const settingsDir = readPath('data.dir');
  if (typeof settingsDir === 'string' && settingsDir.length > 0) {
    return isAbsolute(settingsDir) ? settingsDir : resolve(process.cwd(), settingsDir);
  }

  return globalDataDir();
}

const databaseUrl = process.env.DATABASE_URL || '';
const supabaseUrlEnv = process.env.SUPABASE_URL || '';
const neonProjectIdEnv = process.env.NEON_PROJECT_ID || '';

function detectMode(): 'local' | 'team' | 'remote' {
  if (supabaseUrlEnv || neonProjectIdEnv) return 'remote';
  if (databaseUrl.startsWith('postgres')) return 'team';
  return 'local';
}

const detectedMode = detectMode();
const embeddingsProvider = getEnum('embeddings.provider', 'SQUISH_EMBEDDINGS_PROVIDER', EMBEDDINGS_PROVIDERS, 'local');
const llmEnabled = getBoolean('llm.enabled', 'SQUISH_LLM_ENABLED', false);
const llmProvider = getEnum('llm.provider', 'SQUISH_LLM_PROVIDER', LLM_PROVIDERS, 'openai');
const llmEndpoint = getString('llm.endpoint', 'SQUISH_LLM_ENDPOINT', '');
const graphAutoBuild = getBoolean('graph.autoBuild', 'SQUISH_GRAPH_AUTO_BUILD', true);
const graphAutoExport = getBoolean('graph.autoExport', 'SQUISH_GRAPH_AUTO_EXPORT', false);
const graphExtractionMethod = getEnum('graph.extractionMethod', 'SQUISH_GRAPH_EXTRACTION_METHOD', GRAPH_EXTRACTION_METHODS, 'auto');
const graphMaxContentLength = getNumber('graph.maxContentLength', 'SQUISH_GRAPH_MAX_CONTENT_LENGTH', 10000);
const placeClassificationEnabled = getBoolean('places.placeClassificationEnabled', 'SQUISH_PLACE_LLM_CLASSIFICATION', false);

const scoringWeights = {
  recency: getNumber('scoring.weights.recency', 'SQUISH_WEIGHT_RECENCY', 0.5),
  relevance: getNumber('scoring.weights.relevance', 'SQUISH_WEIGHT_RELEVANCE', 3),
  importance: getNumber('scoring.weights.importance', 'SQUISH_WEIGHT_IMPORTANCE', 2),
  vectorSim: getNumber('scoring.weights.vectorSim', 'SQUISH_WEIGHT_VECTOR_SIM', 3),
  graphBoost: getNumber('scoring.weights.graphBoost', 'SQUISH_WEIGHT_GRAPH_BOOST', 0.2),
};

export const config = {
  mode: detectedMode,
  isLocalMode: detectedMode === 'local',
  isTeamMode: detectedMode === 'team',
  isRemoteMode: detectedMode === 'remote',
  teamBackend: getEnum('team.backend', 'SQUISH_TEAM_BACKEND', ['postgres', 'supabase', 'neon'] as const, 'postgres'),
  remoteBackend: getEnum('remote.backend', 'SQUISH_REMOTE_BACKEND', ['supabase', 'neon'] as const, 'supabase'),

  isManagedMode: getBoolean('managed.enabled', 'SQUISH_MANAGED_MODE', false),
  managedApiUrl: getString('managed.apiUrl', 'SQUISH_MANAGED_API_URL', 'https://api.squish.dev'),
  managedApiKey: getString('managed.apiKey', 'SQUISH_MANAGED_API_KEY', ''),
  redisEnabled: Boolean(process.env.REDIS_URL),
  dataDir: resolveDataDir(),
  mcpServerPort: getNumber('mcp.serverPort', 'SQUISH_MCP_PORT', 8767),
  autoMigrate: getBoolean('autoMigrate', 'SQUISH_AUTO_MIGRATE', false),

  embeddingsProvider,
  openAiApiKey: process.env.SQUISH_OPENAI_API_KEY || process.env.OPENAI_API_KEY || '',
  openAiApiUrl: getString('api.openai.apiUrl', 'SQUISH_OPENAI_API_URL', 'https://api.openai.com/v1/embeddings'),
  openAiEmbeddingModel: getString('embeddings.models.openai.model', 'SQUISH_OPENAI_EMBEDDING_MODEL', ''),
  googleCloudApiKey: process.env.GOOGLE_CLOUD_API_KEY || process.env.SQUISH_GOOGLE_CLOUD_API_KEY || '',
  googleCloudProject: process.env.GOOGLE_CLOUD_PROJECT || process.env.SQUISH_GOOGLE_CLOUD_PROJECT || '',
  googleCloudLocation: process.env.GOOGLE_CLOUD_LOCATION || process.env.SQUISH_GOOGLE_CLOUD_LOCATION || 'us-central1',
  googleEmbeddingModel: getString('embeddings.models.google.model', 'SQUISH_GOOGLE_EMBEDDING_MODEL', ''),
  ollamaUrl: getString('api.ollama.url', 'SQUISH_OLLAMA_URL', 'http://localhost:11434'),
  ollamaEmbeddingModel: getString('embeddings.models.ollama.model', 'SQUISH_OLLAMA_EMBEDDING_MODEL', ''),
  lmStudioUrl: getString('api.lmstudio.url', 'SQUISH_LM_STUDIO_URL', 'http://localhost:1234'),
  lmStudioEmbeddingModel: getString('embeddings.models.lmstudio.model', 'SQUISH_LM_STUDIO_EMBEDDING_MODEL', ''),
  transformersLocalModel: getString('embeddings.models.transformers.model', 'SQUISH_LOCAL_MODEL', ''),

  supabaseUrl: getString('supabase.url', 'SUPABASE_URL', ''),
  supabaseKey: getString('supabase.key', 'SUPABASE_SERVICE_KEY', ''),
  neonProjectId: process.env.NEON_PROJECT_ID || '',
  neonServiceKey: process.env.NEON_SERVICE_KEY || '',
  clientEncryptionEnabled: getBoolean('security.encryptionEnabled', null, false),
  encryptionPassphrase: process.env.SQUISH_ENCRYPTION_PASSPHRASE || '',

  lifecycleEnabled: getBoolean('features.lifecycleEnabled', 'SQUISH_LIFECYCLE_ENABLED', true),
  lifecycleInterval: getNumber('lifecycle.interval', 'SQUISH_LIFECYCLE_INTERVAL', 3600000),
  decayThreshold: getNumber('lifecycle.decay.threshold', 'SQUISH_DECAY_THRESHOLD', 0.1),
  sectorDecayIntervals: {
    episodic: getNumber('lifecycle.decay.episodic', 'SQUISH_DECAY_EPISODIC', 30),
    semantic: getNumber('lifecycle.decay.semantic', 'SQUISH_DECAY_SEMANTIC', 90),
    procedural: getNumber('lifecycle.decay.procedural', 'SQUISH_DECAY_PROCEDURAL', 180),
    autobiographical: getNumber('lifecycle.decay.autobiographical', 'SQUISH_DECAY_AUTOBIOGRAPHICAL', 365),
    working: getNumber('lifecycle.decay.working', 'SQUISH_DECAY_WORKING', 7),
  },
  // Phase 5: Ebbinghaus decay engine config
  decay: {
    engine: getEnum('decay.engine', 'SQUISH_DECAY_ENGINE', DECAY_ENGINES, 'ebbinghaus'),
    hotTierDays: getNumber('decay.hotTierDays', 'SQUISH_DECAY_HOT_TIER_DAYS', 7),
    coldTierDays: getNumber('decay.coldTierDays', 'SQUISH_DECAY_COLD_TIER_DAYS', 30),
  },

  // Phase 7: Memory Tier configuration
  tiers: {
    sturdyAccessCount: getNumber('tiers.sturdyAccessCount', 'SQUISH_STURDY_ACCESS_COUNT', 5),
    sturdyAccessWindow: getNumber('tiers.sturdyAccessWindow', 'SQUISH_STURDY_ACCESS_WINDOW', 30),
    longTermAge: getNumber('tiers.longTermAge', 'SQUISH_LONG_TERM_AGE', 90),
    longTermImportance: getNumber('tiers.longTermImportance', 'SQUISH_LONG_TERM_IMPORTANCE', 50),
    fleetingImportance: getNumber('tiers.fleetingImportance', 'SQUISH_FLETING_IMPORTANCE', 25),
    fleetingAge: getNumber('tiers.fleetingAge', 'SQUISH_FLETING_AGE', 60),
  },

  summarizationEnabled: getBoolean('features.summarizationEnabled', 'SQUISH_SUMMARIZATION_ENABLED', true),
  incrementalThreshold: getNumber('summarization.incrementalThreshold', 'SQUISH_INCREMENTAL_THRESHOLD', 10),
  rollingWindowSize: getNumber('summarization.rollingWindowSize', 'SQUISH_ROLLING_WINDOW_SIZE', 50),
  agentIsolationEnabled: getBoolean('features.agentIsolation', 'SQUISH_AGENT_ISOLATION_ENABLED', true),
  defaultVisibilityScope: getEnum('visibility.defaultScope', 'SQUISH_DEFAULT_VISIBILITY', VISIBILITY_SCOPES, 'private'),
  governanceEnabled: getBoolean('features.governanceEnabled', 'SQUISH_GOVERNANCE_ENABLED', true),
  consolidationEnabled: getBoolean('features.consolidationEnabled', 'SQUISH_CONSOLIDATION_ENABLED', false),
  consolidationSimilarityThreshold: getNumber('consolidation.similarityThreshold', 'SQUISH_CONSOLIDATION_THRESHOLD', 0.8),

  // Geometry-aware consolidation config
  consolidationGeometryEnabled: getBoolean('consolidation.geometry.enabled', 'SQUISH_GEOMETRY_CONSOLIDATION', true),
  consolidationGeometryThetaPrime: getNumber('consolidation.geometry.thetaPrime', 'SQUISH_GEOMETRY_THETA_PRIME', 0.15),
  consolidationGeometryMinClusterSize: getNumber('consolidation.geometry.minClusterSize', 'SQUISH_GEOMETRY_MIN_CLUSTER_SIZE', 3),
  consolidationGeometryAutoConsolidate: getBoolean('consolidation.geometry.autoConsolidate', 'SQUISH_GEOMETRY_AUTO_CONSOLIDATE', true),
  consolidationGeometryAutoSplit: getBoolean('consolidation.geometry.autoSplit', 'SQUISH_GEOMETRY_AUTO_SPLIT', true),
  consolidationGeometryPreservePinned: getBoolean('consolidation.geometry.preservePinned', 'SQUISH_GEOMETRY_PRESERVE_PINNED', true),
  enableV2ContradictionCheck: getBoolean('features.enableV2ContradictionCheck', 'SQUISH_V2_CONTRADICTION_CHECK', false),
  externalMemoryEnabled: getBoolean('features.externalMemoryEnabled', 'SQUISH_EXTERNAL_MEMORY_ENABLED', false),
  externalMemoryPath: getString('external.memoryPath', 'SQUISH_EXTERNAL_MEMORY_PATH', ''),

  sessionAutoLoadEnabled: getBoolean('features.sessionAutoLoadEnabled', 'SQUISH_SESSION_AUTO_LOAD', true),
  sessionAutoLoadRecentCount: getNumber('session.autoLoadRecentCount', 'SQUISH_SESSION_AUTO_LOAD_RECENT_COUNT', 5),
  sessionAutoLoadImportanceThreshold: getNumber('session.autoLoadImportanceThreshold', 'SQUISH_SESSION_AUTO_LOAD_IMPORTANCE_THRESHOLD', 70),
  // Phase 6: Unified Clean command - maintenance scheduling
  maintenanceNightlyClean: getBoolean('maintenance.nightlyClean', 'SQUISH_NIGHTLY_CLEAN', true),
  maintenanceWeeklyConsolidation: getBoolean('maintenance.weeklyConsolidation', 'SQUISH_WEEKLY_CONSOLIDATION', true),
  maintenanceMonthlyDeep: getBoolean('maintenance.monthlyDeep', 'SQUISH_MONTHLY_DEEP', false),

  queryRewritingEnabled: getBoolean('features.queryRewritingEnabled', 'SQUISH_QUERY_REWRITING', true),
  queryRewritingContextMessages: getNumber('query.rewritingContextMessages', 'SQUISH_QUERY_REWRITING_CONTEXT_MESSAGES', 5),
  queryRewritingFallbackEnabled: getBoolean('features.queryRewritingFallbackEnabled', 'SQUISH_QUERY_REWRITING_FALLBACK', true),
  feedbackTrackingEnabled: getBoolean('features.feedbackTrackingEnabled', 'SQUISH_FEEDBACK_TRACKING', true),
  feedbackEchoBonus: getNumber('feedback.echoBonus', 'SQUISH_FEEDBACK_ECHO_BONUS', 10),
  feedbackFizzlePenalty: getNumber('feedback.fizzlePenalty', 'SQUISH_FEEDBACK_FIZZLE_PENALTY', 5),
  scoringWeights,

  schedulerMode: getEnum('scheduler.mode', 'SQUISH_SCHEDULER_MODE', SCHEDULER_MODES, 'cron'),
  cronEnabled: getBoolean('scheduler.cronEnabled', 'SQUISH_CRON_ENABLED', true),
  heartbeatInterval: getNumber('scheduler.heartbeatInterval', 'SQUISH_HEARTBEAT_INTERVAL', 60000),
  jobRetentionDays: getNumber('scheduler.jobRetentionDays', 'SQUISH_JOB_RETENTION_DAYS', 30),
  coreMemoryTotalBytes: getNumber('coreMemory.totalBytes', 'SQUISH_CORE_MEMORY_TOTAL_BYTES', 16384),
  coreMemorySectionBytes: getNumber('coreMemory.sectionBytes', 'SQUISH_CORE_MEMORY_SECTION_BYTES', 4096),

  embeddingsTimeoutMs: getNumber('embeddings.timeout', 'SQUISH_EMBEDDINGS_TIMEOUT_MS', 30000),
  embeddingsMaxRetries: getNumber('embeddings.maxRetries', 'SQUISH_EMBEDDINGS_MAX_RETRIES', 3),
  embeddingsRetryDelayMs: getNumber('embeddings.retryDelay', 'SQUISH_EMBEDDINGS_RETRY_DELAY_MS', 1000),
  openAiTimeoutMs: getNumber('embeddings.models.openai.timeout', 'SQUISH_OPENAI_TIMEOUT_MS', getNumber('embeddings.timeout', 'SQUISH_EMBEDDINGS_TIMEOUT_MS', 30000)),
  ollamaTimeoutMs: getNumber('embeddings.models.ollama.timeout', 'SQUISH_OLLAMA_TIMEOUT_MS', getNumber('embeddings.timeout', 'SQUISH_EMBEDDINGS_TIMEOUT_MS', 30000)),
  googleTimeoutMs: getNumber('embeddings.models.google.timeout', 'SQUISH_GOOGLE_TIMEOUT_MS', getNumber('embeddings.timeout', 'SQUISH_EMBEDDINGS_TIMEOUT_MS', 30000)),

  llmEnabled,
  llmApiKey: process.env.SQUISH_LLM_API_KEY || process.env.OPENAI_API_KEY || '',
  llmProvider,
  llmExtractionModel: getString('llm.models.extraction', 'SQUISH_LLM_EXTRACTION_MODEL', ''),
  llmReasoningModel: getString('llm.models.reasoning', 'SQUISH_LLM_REASONING_MODEL', ''),
  llmEndpoint,
  llm: { enabled: llmEnabled, provider: llmProvider, endpoint: llmEndpoint },

  graphAutoBuild,
  graphAutoExport,
  graphExtractionMethod,
  graphMaxContentLength,
  graphBackend: getEnum('graph.backend', 'SQUISH_GRAPH_BACKEND', ['memory', 'kuzu'] as const, 'memory'),
  kuzuPath: getString('graph.kuzuPath', 'SQUISH_KUZU_PATH', './squish.graph'),
  graph: { autoBuild: graphAutoBuild, autoExport: graphAutoExport, extractionMethod: graphExtractionMethod, maxContentLength: graphMaxContentLength },
  placeClassificationEnabled,
};

export default config;
