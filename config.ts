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

function detectMode(): 'local' | 'team' | 'remote' {
  const databaseUrl = process.env.DATABASE_URL || '';
  const supabaseUrl = process.env.SUPABASE_URL || '';
  const neonProjectId = process.env.NEON_PROJECT_ID || '';
  const managedMode = getBoolean('managed.enabled', 'SQUISH_MANAGED_MODE', false);

  if (supabaseUrl || neonProjectId) return 'remote';
  // Team mode is cloud-managed only. Local PostgreSQL alone should not
  // auto-switch a workstation into team mode.
  if (managedMode && databaseUrl.startsWith('postgres')) return 'team';
  return 'local';
}

let modeOverride: 'local' | 'team' | null = null;

function getEffectiveMode(): 'local' | 'team' | 'remote' {
  if (modeOverride) return modeOverride;
  return detectMode();
}

function getEnvironmentString(key: string, fallback = ''): string {
  return process.env[key] || fallback;
}

function getEnvironmentBoolean(key: string, fallback: boolean): boolean {
  return getBoolean('', key, fallback);
}

function getEnvironmentNumber(key: string, fallback: number): number {
  return getNumber('', key, fallback);
}

function getEnvironmentEnum<T extends readonly string[]>(key: string, allowed: T, fallback: T[number]): T[number] {
  return getEnum('', key, allowed, fallback);
}

function buildScoringWeights() {
  return {
    recency: getNumber('scoring.weights.recency', 'SQUISH_WEIGHT_RECENCY', 0.5),
    relevance: getNumber('scoring.weights.relevance', 'SQUISH_WEIGHT_RELEVANCE', 3),
    importance: getNumber('scoring.weights.importance', 'SQUISH_WEIGHT_IMPORTANCE', 2),
    vectorSim: getNumber('scoring.weights.vectorSim', 'SQUISH_WEIGHT_VECTOR_SIM', 3),
    graphBoost: getNumber('scoring.weights.graphBoost', 'SQUISH_WEIGHT_GRAPH_BOOST', 0.2),
  };
}

function buildLlmConfig() {
  const enabled = getBoolean('llm.enabled', 'SQUISH_LLM_ENABLED', false);
  const provider = getEnum('llm.provider', 'SQUISH_LLM_PROVIDER', LLM_PROVIDERS, 'openai');
  const endpoint = getString('llm.endpoint', 'SQUISH_LLM_ENDPOINT', '');
  return { enabled, provider, endpoint };
}

function buildGraphConfig() {
  const autoBuild = getBoolean('graph.autoBuild', 'SQUISH_GRAPH_AUTO_BUILD', true);
  const autoExport = getBoolean('graph.autoExport', 'SQUISH_GRAPH_AUTO_EXPORT', false);
  const extractionMethod = getEnum('graph.extractionMethod', 'SQUISH_GRAPH_EXTRACTION_METHOD', GRAPH_EXTRACTION_METHODS, 'auto');
  const maxContentLength = getNumber('graph.maxContentLength', 'SQUISH_GRAPH_MAX_CONTENT_LENGTH', 10000);
  return { autoBuild, autoExport, extractionMethod, maxContentLength };
}

function buildSectorDecayIntervals() {
  return {
    episodic: getNumber('lifecycle.decay.episodic', 'SQUISH_DECAY_EPISODIC', 30),
    semantic: getNumber('lifecycle.decay.semantic', 'SQUISH_DECAY_SEMANTIC', 90),
    procedural: getNumber('lifecycle.decay.procedural', 'SQUISH_DECAY_PROCEDURAL', 180),
    autobiographical: getNumber('lifecycle.decay.autobiographical', 'SQUISH_DECAY_AUTOBIOGRAPHICAL', 365),
    working: getNumber('lifecycle.decay.working', 'SQUISH_DECAY_WORKING', 7),
  };
}

function buildDecayConfig() {
  return {
    engine: getEnum('decay.engine', 'SQUISH_DECAY_ENGINE', DECAY_ENGINES, 'ebbinghaus'),
    hotTierDays: getNumber('decay.hotTierDays', 'SQUISH_DECAY_HOT_TIER_DAYS', 7),
    coldTierDays: getNumber('decay.coldTierDays', 'SQUISH_DECAY_COLD_TIER_DAYS', 30),
  };
}

function buildTierConfig() {
  return {
    sturdyAccessCount: getNumber('tiers.sturdyAccessCount', 'SQUISH_STURDY_ACCESS_COUNT', 5),
    sturdyAccessWindow: getNumber('tiers.sturdyAccessWindow', 'SQUISH_STURDY_ACCESS_WINDOW', 30),
    longTermAge: getNumber('tiers.longTermAge', 'SQUISH_LONG_TERM_AGE', 90),
    longTermImportance: getNumber('tiers.longTermImportance', 'SQUISH_LONG_TERM_IMPORTANCE', 50),
    fleetingImportance: getNumber('tiers.fleetingImportance', 'SQUISH_FLETING_IMPORTANCE', 25),
    fleetingAge: getNumber('tiers.fleetingAge', 'SQUISH_FLETING_AGE', 60),
  };
}

function buildConsolidationGeometryConfig() {
  return {
    enabled: getBoolean('consolidation.geometry.enabled', 'SQUISH_GEOMETRY_CONSOLIDATION', true),
    thetaPrime: getNumber('consolidation.geometry.thetaPrime', 'SQUISH_GEOMETRY_THETA_PRIME', 0.15),
    minClusterSize: getNumber('consolidation.geometry.minClusterSize', 'SQUISH_GEOMETRY_MIN_CLUSTER_SIZE', 3),
    autoConsolidate: getBoolean('consolidation.geometry.autoConsolidate', 'SQUISH_GEOMETRY_AUTO_CONSOLIDATE', true),
    autoSplit: getBoolean('consolidation.geometry.autoSplit', 'SQUISH_GEOMETRY_AUTO_SPLIT', true),
    preservePinned: getBoolean('consolidation.geometry.preservePinned', 'SQUISH_GEOMETRY_PRESERVE_PINNED', true),
  };
}

function buildConfig() {
  return {
    get mode() {
      return getEffectiveMode();
    },
    set mode(value: 'local' | 'team' | 'remote') {
      if (value === 'remote') {
        modeOverride = null;
      } else {
        modeOverride = value;
      }
    },
    get isLocalMode() {
      return getEffectiveMode() === 'local';
    },
    get isTeamMode() {
      return getEffectiveMode() === 'team';
    },
    set isTeamMode(value: boolean) {
      modeOverride = value ? 'team' : 'local';
    },
    get isRemoteMode() {
      return getEffectiveMode() === 'remote';
    },
    get teamBackend() {
      return getEnum('team.backend', 'SQUISH_TEAM_BACKEND', ['postgres', 'supabase', 'neon'] as const, 'postgres');
    },
    get remoteBackend() {
      return getEnum('remote.backend', 'SQUISH_REMOTE_BACKEND', ['supabase', 'neon'] as const, 'supabase');
    },

    get isManagedMode() {
      return getBoolean('managed.enabled', 'SQUISH_MANAGED_MODE', false);
    },
    get managedApiUrl() {
      return getString('managed.apiUrl', 'SQUISH_MANAGED_API_URL', 'https://api.squish.dev');
    },
    get managedApiKey() {
      return getString('managed.apiKey', 'SQUISH_MANAGED_API_KEY', '');
    },
    get redisEnabled() {
      return Boolean(process.env.REDIS_URL);
    },
    get dataDir() {
      return resolveDataDir();
    },
    get mcpServerPort() {
      return getNumber('mcp.serverPort', 'SQUISH_MCP_PORT', 8767);
    },
    get autoMigrate() {
      return getBoolean('autoMigrate', 'SQUISH_AUTO_MIGRATE', false);
    },

    get embeddingsProvider() {
      return getEnum('embeddings.provider', 'SQUISH_EMBEDDINGS_PROVIDER', EMBEDDINGS_PROVIDERS, 'local');
    },
    get openAiApiKey() {
      return process.env.SQUISH_OPENAI_API_KEY || process.env.OPENAI_API_KEY || '';
    },
    get openAiApiUrl() {
      return getString('api.openai.apiUrl', 'SQUISH_OPENAI_API_URL', 'https://api.openai.com/v1/embeddings');
    },
    get openAiEmbeddingModel() {
      return getString('embeddings.models.openai.model', 'SQUISH_OPENAI_EMBEDDING_MODEL', '');
    },
    get googleCloudApiKey() {
      return process.env.GOOGLE_CLOUD_API_KEY || process.env.SQUISH_GOOGLE_CLOUD_API_KEY || '';
    },
    get googleCloudProject() {
      return process.env.GOOGLE_CLOUD_PROJECT || process.env.SQUISH_GOOGLE_CLOUD_PROJECT || '';
    },
    get googleCloudLocation() {
      return process.env.GOOGLE_CLOUD_LOCATION || process.env.SQUISH_GOOGLE_CLOUD_LOCATION || 'us-central1';
    },
    get googleEmbeddingModel() {
      return getString('embeddings.models.google.model', 'SQUISH_GOOGLE_EMBEDDING_MODEL', '');
    },
    get ollamaUrl() {
      return getString('api.ollama.url', 'SQUISH_OLLAMA_URL', 'http://localhost:11434');
    },
    get ollamaEmbeddingModel() {
      return getString('embeddings.models.ollama.model', 'SQUISH_OLLAMA_EMBEDDING_MODEL', '');
    },
    get lmStudioUrl() {
      return getString('api.lmstudio.url', 'SQUISH_LM_STUDIO_URL', 'http://localhost:1234');
    },
    get lmStudioEmbeddingModel() {
      return getString('embeddings.models.lmstudio.model', 'SQUISH_LM_STUDIO_EMBEDDING_MODEL', '');
    },
    get transformersLocalModel() {
      return getString('embeddings.models.transformers.model', 'SQUISH_LOCAL_MODEL', '');
    },

    get supabaseUrl() {
      return getString('supabase.url', 'SUPABASE_URL', '');
    },
    get supabaseKey() {
      return getString('supabase.key', 'SUPABASE_SERVICE_KEY', '');
    },
    get neonProjectId() {
      return process.env.NEON_PROJECT_ID || '';
    },
    get neonServiceKey() {
      return process.env.NEON_SERVICE_KEY || '';
    },
    get clientEncryptionEnabled() {
      return getBoolean('security.encryptionEnabled', null, false);
    },
    get encryptionPassphrase() {
      return process.env.SQUISH_ENCRYPTION_PASSPHRASE || '';
    },

    get lifecycleEnabled() {
      return getBoolean('features.lifecycleEnabled', 'SQUISH_LIFECYCLE_ENABLED', true);
    },
    get lifecycleInterval() {
      return getNumber('lifecycle.interval', 'SQUISH_LIFECYCLE_INTERVAL', 3600000);
    },
    get decayThreshold() {
      return getNumber('lifecycle.decay.threshold', 'SQUISH_DECAY_THRESHOLD', 0.1);
    },
    get sectorDecayIntervals() {
      return buildSectorDecayIntervals();
    },
    get decay() {
      return buildDecayConfig();
    },

    get tiers() {
      return buildTierConfig();
    },

    get summarizationEnabled() {
      return getBoolean('features.summarizationEnabled', 'SQUISH_SUMMARIZATION_ENABLED', true);
    },
    get incrementalThreshold() {
      return getNumber('summarization.incrementalThreshold', 'SQUISH_INCREMENTAL_THRESHOLD', 10);
    },
    get rollingWindowSize() {
      return getNumber('summarization.rollingWindowSize', 'SQUISH_ROLLING_WINDOW_SIZE', 50);
    },
    get agentIsolationEnabled() {
      return getBoolean('features.agentIsolation', 'SQUISH_AGENT_ISOLATION_ENABLED', true);
    },
    get defaultVisibilityScope() {
      return getEnum('visibility.defaultScope', 'SQUISH_DEFAULT_VISIBILITY', VISIBILITY_SCOPES, 'private');
    },
    get governanceEnabled() {
      return getBoolean('features.governanceEnabled', 'SQUISH_GOVERNANCE_ENABLED', true);
    },
    get consolidationEnabled() {
      return getBoolean('features.consolidationEnabled', 'SQUISH_CONSOLIDATION_ENABLED', false);
    },
    get consolidationSimilarityThreshold() {
      return getNumber('consolidation.similarityThreshold', 'SQUISH_CONSOLIDATION_THRESHOLD', 0.8);
    },

    get consolidationGeometryEnabled() {
      return buildConsolidationGeometryConfig().enabled;
    },
    get consolidationGeometryThetaPrime() {
      return buildConsolidationGeometryConfig().thetaPrime;
    },
    get consolidationGeometryMinClusterSize() {
      return buildConsolidationGeometryConfig().minClusterSize;
    },
    get consolidationGeometryAutoConsolidate() {
      return buildConsolidationGeometryConfig().autoConsolidate;
    },
    get consolidationGeometryAutoSplit() {
      return buildConsolidationGeometryConfig().autoSplit;
    },
    get consolidationGeometryPreservePinned() {
      return buildConsolidationGeometryConfig().preservePinned;
    },
    get enableV2ContradictionCheck() {
      return getBoolean('features.enableV2ContradictionCheck', 'SQUISH_V2_CONTRADICTION_CHECK', false);
    },
    get externalMemoryEnabled() {
      return getBoolean('features.externalMemoryEnabled', 'SQUISH_EXTERNAL_MEMORY_ENABLED', false);
    },
    get externalMemoryPath() {
      return getString('external.memoryPath', 'SQUISH_EXTERNAL_MEMORY_PATH', '');
    },

    get sessionAutoLoadEnabled() {
      return getBoolean('features.sessionAutoLoadEnabled', 'SQUISH_SESSION_AUTO_LOAD', true);
    },
    get sessionAutoLoadRecentCount() {
      return getNumber('session.autoLoadRecentCount', 'SQUISH_SESSION_AUTO_LOAD_RECENT_COUNT', 5);
    },
    get sessionAutoLoadImportanceThreshold() {
      return getNumber('session.autoLoadImportanceThreshold', 'SQUISH_SESSION_AUTO_LOAD_IMPORTANCE_THRESHOLD', 70);
    },
    get maintenanceNightlyClean() {
      return getBoolean('maintenance.nightlyClean', 'SQUISH_NIGHTLY_CLEAN', true);
    },
    get maintenanceWeeklyConsolidation() {
      return getBoolean('maintenance.weeklyConsolidation', 'SQUISH_WEEKLY_CONSOLIDATION', true);
    },
    get maintenanceMonthlyDeep() {
      return getBoolean('maintenance.monthlyDeep', 'SQUISH_MONTHLY_DEEP', false);
    },

    get queryRewritingEnabled() {
      return getBoolean('features.queryRewritingEnabled', 'SQUISH_QUERY_REWRITING', true);
    },
    get queryRewritingContextMessages() {
      return getNumber('query.rewritingContextMessages', 'SQUISH_QUERY_REWRITING_CONTEXT_MESSAGES', 5);
    },
    get queryRewritingFallbackEnabled() {
      return getBoolean('features.queryRewritingFallbackEnabled', 'SQUISH_QUERY_REWRITING_FALLBACK', true);
    },
    get feedbackTrackingEnabled() {
      return getBoolean('features.feedbackTrackingEnabled', 'SQUISH_FEEDBACK_TRACKING', true);
    },
    get feedbackEchoBonus() {
      return getNumber('feedback.echoBonus', 'SQUISH_FEEDBACK_ECHO_BONUS', 10);
    },
    get feedbackFizzlePenalty() {
      return getNumber('feedback.fizzlePenalty', 'SQUISH_FEEDBACK_FIZZLE_PENALTY', 5);
    },
    get scoringWeights() {
      return buildScoringWeights();
    },

    get schedulerMode() {
      return getEnum('scheduler.mode', 'SQUISH_SCHEDULER_MODE', SCHEDULER_MODES, 'cron');
    },
    get cronEnabled() {
      return getBoolean('scheduler.cronEnabled', 'SQUISH_CRON_ENABLED', true);
    },
    get heartbeatInterval() {
      return getNumber('scheduler.heartbeatInterval', 'SQUISH_HEARTBEAT_INTERVAL', 60000);
    },
    get jobRetentionDays() {
      return getNumber('scheduler.jobRetentionDays', 'SQUISH_JOB_RETENTION_DAYS', 30);
    },
    get coreMemoryTotalBytes() {
      return getNumber('coreMemory.totalBytes', 'SQUISH_CORE_MEMORY_TOTAL_BYTES', 16384);
    },
    get coreMemorySectionBytes() {
      return getNumber('coreMemory.sectionBytes', 'SQUISH_CORE_MEMORY_SECTION_BYTES', 4096);
    },

    get embeddingsTimeoutMs() {
      return getNumber('embeddings.timeout', 'SQUISH_EMBEDDINGS_TIMEOUT_MS', 30000);
    },
    get embeddingsMaxRetries() {
      return getNumber('embeddings.maxRetries', 'SQUISH_EMBEDDINGS_MAX_RETRIES', 3);
    },
    get embeddingsRetryDelayMs() {
      return getNumber('embeddings.retryDelay', 'SQUISH_EMBEDDINGS_RETRY_DELAY_MS', 1000);
    },
    get openAiTimeoutMs() {
      return getNumber('embeddings.models.openai.timeout', 'SQUISH_OPENAI_TIMEOUT_MS', getNumber('embeddings.timeout', 'SQUISH_EMBEDDINGS_TIMEOUT_MS', 30000));
    },
    get ollamaTimeoutMs() {
      return getNumber('embeddings.models.ollama.timeout', 'SQUISH_OLLAMA_TIMEOUT_MS', getNumber('embeddings.timeout', 'SQUISH_EMBEDDINGS_TIMEOUT_MS', 30000));
    },
    get googleTimeoutMs() {
      return getNumber('embeddings.models.google.timeout', 'SQUISH_GOOGLE_TIMEOUT_MS', getNumber('embeddings.timeout', 'SQUISH_EMBEDDINGS_TIMEOUT_MS', 30000));
    },

    // Cross-Encoder Reranker
    get rerankerEnabled() {
      return getBoolean('retrieval.reranker.enabled', 'SQUISH_RERANKER_ENABLED', false);
    },
    get rerankerModel() {
      return getString('retrieval.reranker.model', 'SQUISH_RERANKER_MODEL', 'cross-encoder/ms-marco-MiniLM-L-6-v2');
    },
    get rerankerTopK() {
      return getNumber('retrieval.reranker.topK', 'SQUISH_RERANKER_TOP_K', 30);
    },
    get rerankerReturnTopK() {
      return getNumber('retrieval.reranker.returnTopK', 'SQUISH_RERANKER_RETURN_TOP_K', 20);
    },

    // Contextual Retrieval
    get contextualRetrievalEnabled() {
      return getBoolean('retrieval.contextual.enabled', 'SQUISH_CONTEXTUAL_RETRIEVAL', false);
    },
    get contextualPrefixTemplate() {
      return getString('retrieval.contextual.prefixTemplate', 'SQUISH_CONTEXTUAL_PREFIX_TEMPLATE', '[TYPE] from [PROJECT] about [TOPICS]');
    },

    // MMR Diversity
    get mmrEnabled() {
      return getBoolean('retrieval.mmr.enabled', 'SQUISH_MMR_ENABLED', false);
    },
    get mmrLambda() {
      return getNumber('retrieval.mmr.lambda', 'SQUISH_MMR_LAMBDA', 0.7);
    },

    get llmEnabled() {
      return buildLlmConfig().enabled;
    },
    get llmApiKey() {
      return process.env.SQUISH_LLM_API_KEY || process.env.OPENAI_API_KEY || '';
    },
    get llmProvider() {
      return buildLlmConfig().provider;
    },
    get llmExtractionModel() {
      return getString('llm.models.extraction', 'SQUISH_LLM_EXTRACTION_MODEL', '');
    },
    get llmReasoningModel() {
      return getString('llm.models.reasoning', 'SQUISH_LLM_REASONING_MODEL', '');
    },
    get llmEndpoint() {
      return buildLlmConfig().endpoint;
    },
    get llm() {
      return buildLlmConfig();
    },

    get graphAutoBuild() {
      return buildGraphConfig().autoBuild;
    },
    get graphAutoExport() {
      return buildGraphConfig().autoExport;
    },
    get graphExtractionMethod() {
      return buildGraphConfig().extractionMethod;
    },
    get graphMaxContentLength() {
      return buildGraphConfig().maxContentLength;
    },
    get graph() {
      return buildGraphConfig();
    },
    get placeClassificationEnabled() {
      return getBoolean('places.placeClassificationEnabled', 'SQUISH_PLACE_LLM_CLASSIFICATION', false);
    },
  };
}

export const config = buildConfig();

export default config;
