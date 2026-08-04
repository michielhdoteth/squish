/**
 * Unified Knowledge Types
 * 
 * Single source of truth for all knowledge kinds:
 * memories, beliefs, strategies — stored in one `knowledge` table.
 * 
 * Graph entities and places stay in their own tables but connect
 * via the universal `knowledge_edges` table.
 */

// ─── Knowledge Kinds ─────────────────────────────────────────────────────────

/** What the knowledge IS */
export type KnowledgeKind = 'memory' | 'belief' | 'strategy';

// ─── Knowledge Types (subtypes per kind) ─────────────────────────────────────

/** Memory subtypes (from core/lib/types.ts MemoryType) */
export type MemoryKnowledgeType =
  | 'observation' | 'fact' | 'decision'
  | 'context' | 'preference' | 'note' | 'task';

/** Belief subtypes (from core/beliefs/types.ts BeliefType) */
export type BeliefKnowledgeType =
  | 'decision' | 'preference' | 'failure_cause'
  | 'constraint' | 'state_change' | 'dispute';

/** Strategy subtypes */
export type StrategyKnowledgeType =
  | 'procedure' | 'heuristic' | 'pattern'
  | 'constraint' | 'workaround';

/** All knowledge types combined */
export type KnowledgeType =
  | MemoryKnowledgeType
  | BeliefKnowledgeType
  | StrategyKnowledgeType;

// ─── Graph Entity Types ──────────────────────────────────────────────────────

/** Entity types from the graph system (extensible) */
export type EntityType =
  | 'file' | 'function' | 'class' | 'module' | 'variable'
  | 'concept' | 'person' | 'project' | 'tool' | 'api'
  | 'bug' | 'feature' | 'requirement' | 'decision' | 'event'
  | string; // extensible via LLM extraction

// ─── Place Types ─────────────────────────────────────────────────────────────

/** Place types from the spatial system (extensible) */
export type PlaceType =
  | 'inbox' | 'reference' | 'workspace' | 'sandbox'
  | 'board' | 'sparks' | 'archive'
  | string; // extensible

// ─── Status ──────────────────────────────────────────────────────────────────

/** Unified status across all knowledge kinds */
export type KnowledgeStatus =
  | 'active' | 'superseded' | 'deprecated'
  | 'experimental' | 'disputed';

// ─── Edge Types ──────────────────────────────────────────────────────────────

/** Edge node kinds for cross-system relationships */
export type EdgeNodeKind = 'knowledge' | 'entity' | 'place';

/** Unified edge types across ALL systems */
export type KnowledgeEdgeType =
  // Knowledge-to-Knowledge
  | 'contradicts' | 'supersedes' | 'supports' | 'informed_by'
  | 'depends_on' | 'extends' | 'related_to' | 'causes' | 'rejects'
  | 'sourced_from'
  // Knowledge-to-Entity
  | 'references' | 'about' | 'describes' | 'created_by' | 'affects'
  // Knowledge-to-Place
  | 'located_in' | 'belongs_to' | 'context_of'
  // Entity-to-Entity (from existing RelationType)
  | 'works_on' | 'manages' | 'uses' | 'contains'
  | 'implements' | 'part_of' | 'owns' | 'resolved' | 'blocks'
  // Entity-to-Place
  | 'operates_in';

// ─── Confidence ──────────────────────────────────────────────────────────────

/** Confidence level (from core/lib/types.ts) */
export type ConfidenceLevel = 'certain' | 'speculative' | 'outdated';

// ─── Interfaces ──────────────────────────────────────────────────────────────

/**
 * Unified Knowledge record — the universal row in the knowledge table.
 * 
 * Fields are nullable based on knowledge_kind:
 * - memory: uses content, summary, tags, metadata
 * - belief: uses normalized_key, reason, evidence_summary, last_confirmed_at, source_count
 * - strategy: uses title, description, steps, success_criteria, failure_indicators, usage stats
 */
export interface Knowledge {
  id: string;
  projectId: string | null;
  userId: string | null;
  agentId: string | null;
  sessionId: string | null;

  knowledgeKind: KnowledgeKind;
  knowledgeType: KnowledgeType;

  content: string;
  summary: string | null;

  embeddingJson: string | null;
  embedding: Buffer | null;

  confidence: number;
  confidenceLevel: string;
  importanceScore: number;
  importanceDecayRate: number;
  lastImportanceRecalc: number | null;

  // Belief fields
  normalizedKey: string | null;
  reason: string | null;
  evidenceSummary: string | null;
  lastConfirmedAt: number | null;
  sourceCount: number;

  // Strategy fields
  title: string | null;
  description: string | null;
  steps: string | null; // JSON array of strings
  successCriteria: string | null;
  failureIndicators: string | null;
  usageCount: number;
  successCount: number;
  failureCount: number;
  lastUsedAt: number | null;
  lastSuccessAt: number | null;
  lastFailureAt: number | null;

  status: KnowledgeStatus;

  // Self-referencing relationships
  supersededBy: string | null;
  contradictsId: string | null;
  informedById: string | null;

  tags: string | null; // JSON array
  metadata: Record<string, unknown> | null;

  // Place routing
  placeId: string | null;
  primaryPlace: string | null;

  // Memory lifecycle
  sector: string;
  tier: string;
  isActive: number;

  // Cross-system references (populated at query time via knowledge_edges)
  referencedEntities?: EntityRecord[];
  relatedPlaces?: PlaceRecord[];

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Input for creating a new knowledge record.
 * Automatically detects knowledge_kind from provided fields.
 */
export interface CreateKnowledgeInput {
  projectId?: string;
  userId?: string;
  agentId?: string;
  sessionId?: string;

  knowledgeKind: KnowledgeKind;
  knowledgeType: KnowledgeType;

  content: string;
  summary?: string;

  embeddingJson?: string;
  embedding?: Buffer;

  confidence?: number;
  confidenceLevel?: ConfidenceLevel;
  importanceScore?: number;
  importanceDecayRate?: number;
  lastImportanceRecalc?: number;

  // Belief fields
  normalizedKey?: string;
  reason?: string;
  evidenceSummary?: string;
  lastConfirmedAt?: number;
  sourceCount?: number;

  // Strategy fields
  title?: string;
  description?: string;
  steps?: string[];
  successCriteria?: string;
  failureIndicators?: string;
  usageCount?: number;
  successCount?: number;
  failureCount?: number;
  lastUsedAt?: number;
  lastSuccessAt?: number;
  lastFailureAt?: number;

  status?: KnowledgeStatus;
  supersededBy?: string;
  contradictsId?: string;
  informedById?: string;

  tags?: string[];
  metadata?: Record<string, unknown>;

  placeId?: string;
  primaryPlace?: string;

  sector?: string;
  tier?: string;
  isActive?: number;
}

// ─── Graph Entity ────────────────────────────────────────────────────────────

/**
 * Graph entity record — stays in the `entities` table.
 * Connected to knowledge via knowledge_edges.
 */
export interface EntityRecord {
  id: string;
  projectId: string | null;
  name: string;
  type: EntityType;
  description: string | null;
  properties: Record<string, unknown> | null;
  embeddingJson: string | null;
  mentionCount: number;
  lastMentionedAt: number | null;
  aliases: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Input for creating/updating an entity.
 */
export interface CreateEntityInput {
  projectId?: string;
  name: string;
  type: EntityType;
  description?: string;
  properties?: Record<string, unknown>;
  embeddingJson?: string;
  aliases?: string[];
}

// ─── Place ───────────────────────────────────────────────────────────────────

/**
 * Place record — stays in the `places` table.
 * Connected to knowledge via knowledge_edges.
 */
export interface PlaceRecord {
  id: string;
  projectId: string;
  name: string;
  placeType: PlaceType;
  parentId: string | null;
  sortOrder: number;
  positionX: number;
  positionY: number;
  description: string | null;
  purpose: string | null;
  memoryCount: number;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Cross-System Edge ───────────────────────────────────────────────────────

/**
 * Universal edge connecting any two nodes across systems.
 * Replaces: belief_edges, strategy_edges, strategy_belief_edges, entity_relations, memory_places.
 */
export interface KnowledgeEdge {
  id: string;
  fromId: string;
  fromKind: EdgeNodeKind;
  toId: string;
  toKind: EdgeNodeKind;
  edgeType: KnowledgeEdgeType;
  weight: number;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

/**
 * Input for creating a knowledge edge.
 */
export interface CreateKnowledgeEdgeInput {
  fromId: string;
  fromKind: EdgeNodeKind;
  toId: string;
  toKind: EdgeNodeKind;
  edgeType: KnowledgeEdgeType;
  weight?: number;
  metadata?: Record<string, unknown>;
}

// ─── Recall Types ────────────────────────────────────────────────────────────

/**
 * Options for unified recall across all knowledge kinds.
 */
export interface RecallOptions {
  projectId?: string;
  kinds?: KnowledgeKind[];
  types?: KnowledgeType[];
  includeEntities?: boolean;
  includePlaces?: boolean;
  includeEdges?: boolean;
  status?: KnowledgeStatus;
  minConfidence?: number;
  limit?: number;
}

/**
 * Result of unified recall.
 */
export interface RecallResult {
  knowledge: Knowledge[];
  entities: EntityRecord[];
  places: PlaceRecord[];
  edges: KnowledgeEdge[];
  routing: {
    intent: string;
    strategy: string;
    confidence: number;
  };
  metadata: {
    totalResults: number;
    durationMs: number;
    sources: string[];
  };
}

// ─── Stored Belief (used by belief adapter in store.ts) ─────────────────────

/**
 * Stored belief shape — used by belief adapter functions in store.ts
 * and by the explain module. Not deprecated; actively consumed.
 */
export interface StoredBelief {
  id: string;
  projectId: string;
  type: BeliefKnowledgeType;
  statement: string;
  normalizedKey: string;
  confidence: number;
  status: KnowledgeStatus;
  reason?: string;
  context?: string;
  evidenceSummary?: string;
  sourceMemoryIds: string[];
  lastConfirmedAt?: Date | string | number | null;
  sourceCount?: number;
  beliefDecayRate?: number;
  createdAt?: Date | string | number | null;
  updatedAt?: Date | string | number | null;
}

// ─── Extraction Types ────────────────────────────────────────────────────────

/**
 * Extracted belief from conversation — used by unified extractor.
 */
export interface ExtractedBelief {
  type: BeliefKnowledgeType;
  statement: string;
  confidence: number;
  sourceMemoryIds: string[];
  status: KnowledgeStatus;
  reason?: string;
  context?: string;
  evidenceSummary?: string;
}

/**
 * Extracted strategy from conversation — used by unified extractor.
 */
export interface ExtractedStrategy {
  strategyType: StrategyKnowledgeType;
  title: string;
  description: string;
  context: string;
  steps: string[];
  successCriteria: string;
  failureIndicators: string;
  confidence: number;
  sourceType: 'conversation' | 'learning' | 'belief' | 'trace' | 'memory';
  sourceId: string;
}
