/**
 * Retrieval Configuration for Squish v1.5.0
 * 
 * Configurable scoring weights and retrieval parameters.
 * All values have sensible defaults and can be overridden via config or env vars.
 */

import config from '../../config.js';

export interface RetrievalScoringConfig {
  /** Boost for memories matching the query's place type */
  placeBoost: number;
  /** Boost per overlapping tag between query and memory */
  tagOverlapBoost: number;
  /** Boost for memories connected via graph relationships */
  graphNeighborBoost: number;
  /** Boost for recent memories (decays over time) */
  recencyBoost: number;
  /** Boost for frequently accessed memories */
  usageBoost: number;
  /** Penalty for superseded memories */
  supersededPenalty: number;
  /** Penalty for memories with contradiction risk */
  contradictionRiskPenalty: number;
}

export interface SquishRetrievalConfig {
  /** Minimum weight threshold for secondary place matches */
  placeMinWeight: number;
  /** Minimum number of results before fallback triggers */
  minResults: number;
  /** Whether to include superseded memories in results */
  includeSuperseded: boolean;
  /** Maximum tags per memory */
  tagCap: number;
  /** Scoring weights */
  scoring: RetrievalScoringConfig;
}

const DEFAULT_SCORING: RetrievalScoringConfig = {
  placeBoost: 0.15,
  tagOverlapBoost: 0.10,
  graphNeighborBoost: 0.05,
  recencyBoost: 0.03,
  usageBoost: 0.02,
  supersededPenalty: 0.50,
  contradictionRiskPenalty: 0.20,
};

const DEFAULT_CONFIG: SquishRetrievalConfig = {
  placeMinWeight: 0.35,
  minResults: 3,
  includeSuperseded: false,
  tagCap: 12,
  scoring: DEFAULT_SCORING,
};

/**
 * Get retrieval config, merging defaults with any overrides
 */
export function getRetrievalConfig(overrides?: Partial<SquishRetrievalConfig>): SquishRetrievalConfig {
  const envConfig = getEnvRetrievalConfig();
  return {
    ...DEFAULT_CONFIG,
    ...envConfig,
    ...overrides,
    scoring: {
      ...DEFAULT_CONFIG.scoring,
      ...envConfig.scoring,
      ...overrides?.scoring,
    },
  };
}

/**
 * Environment-based retrieval config
 * Reads from SQUISH_RETRIEVAL_* env vars
 */
export function getEnvRetrievalConfig(): Partial<SquishRetrievalConfig> {
  const env = process.env;
  
  const scoring: Partial<RetrievalScoringConfig> = {};
  
  if (env.SQUISH_PLACE_BOOST) scoring.placeBoost = Number(env.SQUISH_PLACE_BOOST);
  if (env.SQUISH_TAG_OVERLAP_BOOST) scoring.tagOverlapBoost = Number(env.SQUISH_TAG_OVERLAP_BOOST);
  if (env.SQUISH_GRAPH_NEIGHBOR_BOOST) scoring.graphNeighborBoost = Number(env.SQUISH_GRAPH_NEIGHBOR_BOOST);
  if (env.SQUISH_RECENCY_BOOST) scoring.recencyBoost = Number(env.SQUISH_RECENCY_BOOST);
  if (env.SQUISH_USAGE_BOOST) scoring.usageBoost = Number(env.SQUISH_USAGE_BOOST);
  if (env.SQUISH_SUPERSEDED_PENALTY) scoring.supersededPenalty = Number(env.SQUISH_SUPERSEDED_PENALTY);
  if (env.SQUISH_CONTRADICTION_RISK_PENALTY) scoring.contradictionRiskPenalty = Number(env.SQUISH_CONTRADICTION_RISK_PENALTY);
  
  const result: Partial<SquishRetrievalConfig> = {};
  
  if (env.SQUISH_PLACE_MIN_WEIGHT) result.placeMinWeight = Number(env.SQUISH_PLACE_MIN_WEIGHT);
  if (env.SQUISH_MIN_RESULTS) result.minResults = Number(env.SQUISH_MIN_RESULTS);
  if (env.SQUISH_INCLUDE_SUPERSEDED) result.includeSuperseded = env.SQUISH_INCLUDE_SUPERSEDED === 'true';
  if (env.SQUISH_TAG_CAP) result.tagCap = Number(env.SQUISH_TAG_CAP);
  
  if (Object.keys(scoring).length > 0) {
    result.scoring = scoring as RetrievalScoringConfig;
  }
  
  return result;
}

/**
 * Score breakdown for a single memory result
 */
export interface ScoreBreakdown {
  semanticSimilarity: number;
  placeBoost: number;
  tagOverlapBoost: number;
  graphNeighborBoost: number;
  recencyBoost: number;
  usageBoost: number;
  supersededPenalty: number;
  contradictionRiskPenalty: number;
  finalScore: number;
}

/**
 * Calculate composite score for a memory given query context
 */
export function calculateCompositeScore(params: {
  semanticSimilarity: number;
  placeMatch: boolean;
  tagOverlapCount: number;
  graphNeighborCount: number;
  createdAt?: number;  // unix timestamp ms
  accessCount?: number;
  isSuperseded?: boolean;
  hasContradictionRisk?: boolean;
  config?: SquishRetrievalConfig;
}): ScoreBreakdown {
  const cfg = params.config ?? getRetrievalConfig();
  const s = cfg.scoring;
  
  let placeBoost = 0;
  if (params.placeMatch) {
    placeBoost = s.placeBoost;
  }
  
  // Tag overlap: boost scales with number of overlapping tags (capped)
  const tagOverlapBoost = Math.min(params.tagOverlapCount * s.tagOverlapBoost, 0.30);
  
  // Graph neighbor: small boost per connected neighbor (capped)
  const graphNeighborBoost = Math.min(params.graphNeighborCount * s.graphNeighborBoost, 0.15);
  
  // Recency: exponential decay over 30 days
  let recencyBoost = 0;
  if (params.createdAt) {
    const ageHours = (Date.now() - params.createdAt) / (1000 * 60 * 60);
    recencyBoost = s.recencyBoost * Math.exp(-ageHours / 720);
  }
  
  // Usage: logarithmic boost
  let usageBoost = 0;
  if (params.accessCount && params.accessCount > 0) {
    usageBoost = Math.min(s.usageBoost * Math.log2(params.accessCount + 1), 0.10);
  }
  
  // Penalties
  const supersededPenalty = params.isSuperseded ? s.supersededPenalty : 0;
  const contradictionRiskPenalty = params.hasContradictionRisk ? s.contradictionRiskPenalty : 0;
  
  // Final score
  const finalScore = Math.max(0, Math.min(1.0,
    params.semanticSimilarity
    + placeBoost
    + tagOverlapBoost
    + graphNeighborBoost
    + recencyBoost
    + usageBoost
    - supersededPenalty
    - contradictionRiskPenalty
  ));
  
  return {
    semanticSimilarity: params.semanticSimilarity,
    placeBoost,
    tagOverlapBoost,
    graphNeighborBoost,
    recencyBoost,
    usageBoost,
    supersededPenalty,
    contradictionRiskPenalty,
    finalScore,
  };
}

/**
 * Retrieval trace for debugging
 */
export interface RetrievalTrace {
  selectedPlace: string | null;
  fallbackUsed: boolean;
  fallbackPlaces: string[];
  matchedPlaces: string[];
  matchedTags: string[];
  /** Per-memory score breakdown as key-value pairs (memoryId -> finalScore) */
  scoreBreakdown: Record<string, number>;
  /** Legacy: detailed score breakdowns per memory */
  scoreBreakdowns: ScoreBreakdown[];
  supersededFiltered: number;
  totalCandidates: number;
  /** Memory IDs in final rank order */
  finalOrder: string[];
  finalResultCount: number;
}
