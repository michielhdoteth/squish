/**
 * Unified Knowledge Store
 * 
 * CRUD operations for the knowledge table.
 * Handles all knowledge kinds: memories, beliefs, strategies.
 * 
 * Also provides knowledge_edges operations for cross-system relationships.
 */

import { randomUUID } from 'crypto';
import { getDbClient } from '../lib/db-client.js';
import { logger } from '../logger.js';
import type {
  Knowledge,
  KnowledgeKind,
  KnowledgeType,
  KnowledgeStatus,
  CreateKnowledgeInput,
  KnowledgeEdge,
  CreateKnowledgeEdgeInput,
  EdgeNodeKind,
  ExtractedBelief,
  StoredBelief,
  BeliefKnowledgeType,
} from './types.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function serializeJson(obj: Record<string, unknown> | null | undefined): string | null {
  if (!obj) return null;
  return JSON.stringify(obj);
}

function deserializeJson<T>(str: string | null | undefined): T | null {
  if (!str) return null;
  try { return JSON.parse(str) as T; } catch { return null; }
}

function toKnowledge(row: any): Knowledge {
  return {
    id: row.id,
    projectId: row.project_id ?? null,
    userId: row.user_id ?? null,
    agentId: row.agent_id ?? null,
    sessionId: row.session_id ?? null,
    knowledgeKind: row.knowledge_kind as KnowledgeKind,
    knowledgeType: row.knowledge_type as KnowledgeType,
    content: row.content,
    summary: row.summary ?? null,
    embeddingJson: row.embedding_json ?? null,
    embedding: row.embedding ?? null,
    confidence: row.confidence ?? 0.5,
    confidenceLevel: row.confidence_level ?? 'certain',
    importanceScore: row.importance_score ?? 0.5,
    importanceDecayRate: row.importance_decay_rate ?? 30,
    lastImportanceRecalc: row.last_importance_recalc ?? null,
    normalizedKey: row.normalized_key ?? null,
    reason: row.reason ?? null,
    evidenceSummary: row.evidence_summary ?? null,
    lastConfirmedAt: row.last_confirmed_at ?? null,
    sourceCount: row.source_count ?? 1,
    title: row.title ?? null,
    description: row.description ?? null,
    steps: row.steps ?? null,
    successCriteria: row.success_criteria ?? null,
    failureIndicators: row.failure_indicators ?? null,
    usageCount: row.usage_count ?? 0,
    successCount: row.success_count ?? 0,
    failureCount: row.failure_count ?? 0,
    lastUsedAt: row.last_used_at ?? null,
    lastSuccessAt: row.last_success_at ?? null,
    lastFailureAt: row.last_failure_at ?? null,
    status: row.status as KnowledgeStatus ?? 'active',
    supersededBy: row.superseded_by ?? null,
    contradictsId: row.contradicts_id ?? null,
    informedById: row.informed_by_id ?? null,
    tags: row.tags ?? null,
    metadata: deserializeJson(row.metadata),
    placeId: row.place_id ?? null,
    primaryPlace: row.primary_place ?? null,
    sector: row.sector ?? 'general',
    tier: row.tier ?? 'episodic',
    isActive: row.is_active ?? 1,
    createdAt: new Date((row.created_at ?? 0) * 1000),
    updatedAt: new Date((row.updated_at ?? 0) * 1000),
  };
}

function toKnowledgeEdge(row: any): KnowledgeEdge {
  return {
    id: row.id,
    fromId: row.from_id,
    fromKind: row.from_kind as EdgeNodeKind,
    toId: row.to_id,
    toKind: row.to_kind as EdgeNodeKind,
    edgeType: row.edge_type,
    weight: row.weight ?? 1.0,
    metadata: deserializeJson(row.metadata),
    createdAt: new Date((row.created_at ?? 0) * 1000),
  };
}

// ─── Table Creation ──────────────────────────────────────────────────────────

/**
 * Ensure the knowledge and knowledge_edges tables exist.
 * Called lazily on first operation.
 */
export async function ensureKnowledgeTables(): Promise<void> {
  const { raw } = await getDbClient();
  const sqlite = (raw as any).$client;
  if (!sqlite || typeof sqlite.prepare !== 'function') return;

  const tableCheck = sqlite.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='knowledge'"
  ).get() as { name: string } | undefined;

  if (!tableCheck) {
    logger.info('Migration: Creating knowledge tables');
    try {
      sqlite.exec(`
        CREATE TABLE IF NOT EXISTS knowledge (
          id TEXT PRIMARY KEY,
          project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
          user_id TEXT,
          agent_id TEXT,
          session_id TEXT,
          knowledge_kind TEXT NOT NULL,
          knowledge_type TEXT NOT NULL,
          content TEXT NOT NULL,
          summary TEXT,
          embedding_json TEXT,
          embedding BLOB,
          confidence REAL DEFAULT 0.5,
          confidence_level TEXT DEFAULT 'certain',
          importance_score REAL DEFAULT 0.5,
          importance_decay_rate REAL DEFAULT 30,
          last_importance_recalc INTEGER,
          normalized_key TEXT,
          reason TEXT,
          evidence_summary TEXT,
          last_confirmed_at INTEGER,
          source_count INTEGER DEFAULT 1,
          title TEXT,
          description TEXT,
          steps TEXT,
          success_criteria TEXT,
          failure_indicators TEXT,
          usage_count INTEGER DEFAULT 0,
          success_count INTEGER DEFAULT 0,
          failure_count INTEGER DEFAULT 0,
          last_used_at INTEGER,
          last_success_at INTEGER,
          last_failure_at INTEGER,
          status TEXT DEFAULT 'active',
          superseded_by TEXT,
          contradicts_id TEXT,
          informed_by_id TEXT,
          tags TEXT,
          metadata TEXT,
          place_id TEXT,
          primary_place TEXT,
          sector TEXT DEFAULT 'general',
          tier TEXT DEFAULT 'episodic',
          is_active INTEGER DEFAULT 1,
          created_at INTEGER DEFAULT (strftime('%s','now')) NOT NULL,
          updated_at INTEGER DEFAULT (strftime('%s','now')) NOT NULL
        )
      `);

      // Create indexes
      sqlite.exec(`CREATE INDEX IF NOT EXISTS knowledge_project_idx ON knowledge(project_id)`);
      sqlite.exec(`CREATE INDEX IF NOT EXISTS knowledge_kind_idx ON knowledge(knowledge_kind)`);
      sqlite.exec(`CREATE INDEX IF NOT EXISTS knowledge_type_idx ON knowledge(knowledge_type)`);
      sqlite.exec(`CREATE INDEX IF NOT EXISTS knowledge_status_idx ON knowledge(status)`);
      sqlite.exec(`CREATE INDEX IF NOT EXISTS knowledge_session_idx ON knowledge(session_id)`);
      sqlite.exec(`CREATE INDEX IF NOT EXISTS knowledge_project_kind_idx ON knowledge(project_id, knowledge_kind)`);
      sqlite.exec(`CREATE INDEX IF NOT EXISTS knowledge_created_idx ON knowledge(created_at)`);
    } catch (error) {
      logger.warn(`Migration: Could not create knowledge table: ${error}`);
    }
  }

  // Ensure knowledge_edges table
  const edgesCheck = sqlite.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='knowledge_edges'"
  ).get() as { name: string } | undefined;

  if (!edgesCheck) {
    try {
      sqlite.exec(`
        CREATE TABLE IF NOT EXISTS knowledge_edges (
          id TEXT PRIMARY KEY,
          from_id TEXT NOT NULL,
          from_kind TEXT NOT NULL,
          to_id TEXT NOT NULL,
          to_kind TEXT NOT NULL,
          edge_type TEXT NOT NULL,
          weight REAL DEFAULT 1.0,
          metadata TEXT,
          created_at INTEGER DEFAULT (strftime('%s','now')) NOT NULL
        )
      `);
      sqlite.exec(`CREATE INDEX IF NOT EXISTS knowledge_edges_from_idx ON knowledge_edges(from_id, from_kind)`);
      sqlite.exec(`CREATE INDEX IF NOT EXISTS knowledge_edges_to_idx ON knowledge_edges(to_id, to_kind)`);
      sqlite.exec(`CREATE INDEX IF NOT EXISTS knowledge_edges_type_idx ON knowledge_edges(edge_type)`);
      sqlite.exec(`CREATE UNIQUE INDEX IF NOT EXISTS knowledge_edges_unique ON knowledge_edges(from_id, from_kind, to_id, to_kind, edge_type)`);
    } catch (error) {
      logger.warn(`Migration: Could not create knowledge_edges table: ${error}`);
    }
  }
}

// ─── Knowledge CRUD ──────────────────────────────────────────────────────────

/**
 * Insert a new knowledge record.
 */
export async function createKnowledge(input: CreateKnowledgeInput): Promise<Knowledge> {
  await ensureKnowledgeTables();
  const { raw } = await getDbClient();
  const sqlite = (raw as any).$client;
  if (!sqlite) throw new Error('Database not available');

  const id = randomUUID();
  const now = Math.floor(Date.now() / 1000);

  sqlite.prepare(`
    INSERT INTO knowledge (
      id, project_id, user_id, agent_id, session_id,
      knowledge_kind, knowledge_type,
      content, summary,
      embedding_json, embedding,
      confidence, confidence_level, importance_score, importance_decay_rate, last_importance_recalc,
      normalized_key, reason, evidence_summary, last_confirmed_at, source_count,
      title, description, steps, success_criteria, failure_indicators,
      usage_count, success_count, failure_count, last_used_at, last_success_at, last_failure_at,
      status, superseded_by, contradicts_id, informed_by_id,
      tags, metadata,
      place_id, primary_place,
      sector, tier, is_active,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    input.projectId ?? null,
    input.userId ?? null,
    input.agentId ?? null,
    input.sessionId ?? null,
    input.knowledgeKind,
    input.knowledgeType,
    input.content,
    input.summary ?? null,
    input.embeddingJson ?? null,
    input.embedding ?? null,
    input.confidence ?? 0.5,
    input.confidenceLevel ?? 'certain',
    input.importanceScore ?? 0.5,
    input.importanceDecayRate ?? 30,
    input.lastImportanceRecalc ?? null,
    input.normalizedKey ?? null,
    input.reason ?? null,
    input.evidenceSummary ?? null,
    input.lastConfirmedAt ?? null,
    input.sourceCount ?? 1,
    input.title ?? null,
    input.description ?? null,
    input.steps ? JSON.stringify(input.steps) : null,
    input.successCriteria ?? null,
    input.failureIndicators ?? null,
    input.usageCount ?? 0,
    input.successCount ?? 0,
    input.failureCount ?? 0,
    input.lastUsedAt ?? null,
    input.lastSuccessAt ?? null,
    input.lastFailureAt ?? null,
    input.status ?? 'active',
    input.supersededBy ?? null,
    input.contradictsId ?? null,
    input.informedById ?? null,
    input.tags ? JSON.stringify(input.tags) : null,
    serializeJson(input.metadata ?? null),
    input.placeId ?? null,
    input.primaryPlace ?? null,
    input.sector ?? 'general',
    input.tier ?? 'episodic',
    input.isActive ?? 1,
    now,
    now,
  );

  const result = await getKnowledgeById(id);
  if (!result) throw new Error(`Failed to create knowledge record with id ${id}`);
  return result;
}

/**
 * Get a knowledge record by ID.
 */
export async function getKnowledgeById(id: string): Promise<Knowledge | null> {
  await ensureKnowledgeTables();
  const { raw } = await getDbClient();
  const sqlite = (raw as any).$client;
  if (!sqlite) return null;

  const row = sqlite.prepare('SELECT * FROM knowledge WHERE id = ?').get(id);
  return row ? toKnowledge(row) : null;
}

/**
 * Update a knowledge record.
 */
export async function updateKnowledge(
  id: string,
  updates: Partial<CreateKnowledgeInput>
): Promise<Knowledge | null> {
  await ensureKnowledgeTables();
  const { raw } = await getDbClient();
  const sqlite = (raw as any).$client;
  if (!sqlite) return null;

  const setClauses: string[] = [];
  const values: any[] = [];

  const fieldMap: Record<string, [string, (v: any) => any]> = {
    knowledgeKind: ['knowledge_kind', (v: string) => v],
    knowledgeType: ['knowledge_type', (v: string) => v],
    content: ['content', (v: string) => v],
    summary: ['summary', (v: string) => v],
    confidence: ['confidence', (v: number) => v],
    confidenceLevel: ['confidence_level', (v: string) => v],
    importanceScore: ['importance_score', (v: number) => v],
    importanceDecayRate: ['importance_decay_rate', (v: number) => v],
    normalizedKey: ['normalized_key', (v: string) => v],
    reason: ['reason', (v: string) => v],
    evidenceSummary: ['evidence_summary', (v: string) => v],
    lastConfirmedAt: ['last_confirmed_at', (v: number) => v],
    sourceCount: ['source_count', (v: number) => v],
    title: ['title', (v: string) => v],
    description: ['description', (v: string) => v],
    steps: ['steps', (v: string[]) => JSON.stringify(v)],
    successCriteria: ['success_criteria', (v: string) => v],
    failureIndicators: ['failure_indicators', (v: string) => v],
    usageCount: ['usage_count', (v: number) => v],
    successCount: ['success_count', (v: number) => v],
    failureCount: ['failure_count', (v: number) => v],
    lastUsedAt: ['last_used_at', (v: number) => v],
    lastSuccessAt: ['last_success_at', (v: number) => v],
    lastFailureAt: ['last_failure_at', (v: number) => v],
    status: ['status', (v: string) => v],
    supersededBy: ['superseded_by', (v: string) => v],
    contradictsId: ['contradicts_id', (v: string) => v],
    informedById: ['informed_by_id', (v: string) => v],
    tags: ['tags', (v: string[]) => JSON.stringify(v)],
    metadata: ['metadata', (v: Record<string, unknown>) => serializeJson(v)],
    sector: ['sector', (v: string) => v],
    tier: ['tier', (v: string) => v],
    isActive: ['is_active', (v: number) => v],
  };

  for (const [key, value] of Object.entries(updates)) {
    if (key === 'projectId' || key === 'userId' || key === 'agentId' || key === 'sessionId') continue;
    const mapping = fieldMap[key];
    if (mapping && value !== undefined) {
      setClauses.push(`${mapping[0]} = ?`);
      values.push(mapping[1](value));
    }
  }

  if (setClauses.length === 0) return getKnowledgeById(id);

  setClauses.push('updated_at = ?');
  values.push(Math.floor(Date.now() / 1000));
  values.push(id);

  sqlite.prepare(`UPDATE knowledge SET ${setClauses.join(', ')} WHERE id = ?`).run(...values);

  return getKnowledgeById(id);
}

/**
 * Delete a knowledge record by ID.
 */
export async function deleteKnowledge(id: string): Promise<boolean> {
  await ensureKnowledgeTables();
  const { raw } = await getDbClient();
  const sqlite = (raw as any).$client;
  if (!sqlite) return false;

  const result = sqlite.prepare('DELETE FROM knowledge WHERE id = ?').run(id);
  return result.changes > 0;
}

/**
 * Search knowledge by kind, status, and/or content.
 * Supports both vector and text search.
 */
export async function searchKnowledge(options: {
  projectId?: string;
  kinds?: KnowledgeKind[];
  types?: KnowledgeType[];
  status?: KnowledgeStatus;
  minConfidence?: number;
  contentQuery?: string;
  limit?: number;
  offset?: number;
}): Promise<Knowledge[]> {
  await ensureKnowledgeTables();
  const { raw } = await getDbClient();
  const sqlite = (raw as any).$client;
  if (!sqlite) return [];

  const where: string[] = ['is_active = 1'];
  const params: any[] = [];

  if (options.projectId) {
    where.push('project_id = ?');
    params.push(options.projectId);
  }
  if (options.kinds && options.kinds.length > 0) {
    where.push(`knowledge_kind IN (${options.kinds.map(() => '?').join(',')})`);
    params.push(...options.kinds);
  }
  if (options.types && options.types.length > 0) {
    where.push(`knowledge_type IN (${options.types.map(() => '?').join(',')})`);
    params.push(...options.types);
  }
  if (options.status) {
    where.push('status = ?');
    params.push(options.status);
  }
  if (options.minConfidence !== undefined) {
    where.push('confidence >= ?');
    params.push(options.minConfidence);
  }
  if (options.contentQuery) {
    where.push('content LIKE ?');
    params.push(`%${options.contentQuery}%`);
  }

  const limit = options.limit ?? 50;
  const offset = options.offset ?? 0;

  const rows = sqlite.prepare(`
    SELECT * FROM knowledge
    WHERE ${where.join(' AND ')}
    ORDER BY confidence DESC, created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset);

  return rows.map(toKnowledge);
}

/**
 * Get all active knowledge for a project, grouped by kind.
 */
export async function listKnowledgeByKind(
  projectId: string,
  kind: KnowledgeKind,
  options?: { status?: KnowledgeStatus; types?: KnowledgeType[]; limit?: number }
): Promise<Knowledge[]> {
  return searchKnowledge({
    projectId,
    kinds: [kind],
    types: options?.types,
    status: options?.status ?? 'active',
    limit: options?.limit ?? 100,
  });
}

// ─── Knowledge Edges ─────────────────────────────────────────────────────────

/**
 * Create an edge between two nodes (knowledge, entity, or place).
 * Deduplicates by the unique constraint.
 */
export async function createKnowledgeEdge(input: CreateKnowledgeEdgeInput): Promise<KnowledgeEdge> {
  await ensureKnowledgeTables();
  const { raw } = await getDbClient();
  const sqlite = (raw as any).$client;
  if (!sqlite) throw new Error('Database not available');

  const id = randomUUID();
  const now = Math.floor(Date.now() / 1000);

  // Upsert: ignore if edge already exists
  sqlite.prepare(`
    INSERT OR IGNORE INTO knowledge_edges (id, from_id, from_kind, to_id, to_kind, edge_type, weight, metadata, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    input.fromId,
    input.fromKind,
    input.toId,
    input.toKind,
    input.edgeType,
    input.weight ?? 1.0,
    serializeJson(input.metadata ?? null),
    now,
  );

  // Return the edge (may be the existing one if ignored)
  const row = sqlite.prepare(`
    SELECT * FROM knowledge_edges WHERE from_id = ? AND from_kind = ? AND to_id = ? AND to_kind = ? AND edge_type = ?
  `).get(input.fromId, input.fromKind, input.toId, input.toKind, input.edgeType);

  return row ? toKnowledgeEdge(row) : { id, ...input, weight: input.weight ?? 1.0, metadata: input.metadata ?? null, createdAt: new Date(now * 1000) };
}

/**
 * Get all edges from a node (outgoing).
 */
export async function getEdgesFrom(
  nodeId: string,
  nodeKind: EdgeNodeKind,
  edgeType?: string
): Promise<KnowledgeEdge[]> {
  await ensureKnowledgeTables();
  const { raw } = await getDbClient();
  const sqlite = (raw as any).$client;
  if (!sqlite) return [];

  let query = 'SELECT * FROM knowledge_edges WHERE from_id = ? AND from_kind = ?';
  const params: any[] = [nodeId, nodeKind];

  if (edgeType) {
    query += ' AND edge_type = ?';
    params.push(edgeType);
  }

  query += ' ORDER BY weight DESC';

  return sqlite.prepare(query).all(...params).map(toKnowledgeEdge);
}

/**
 * Get all edges to a node (incoming).
 */
export async function getEdgesTo(
  nodeId: string,
  nodeKind: EdgeNodeKind,
  edgeType?: string
): Promise<KnowledgeEdge[]> {
  await ensureKnowledgeTables();
  const { raw } = await getDbClient();
  const sqlite = (raw as any).$client;
  if (!sqlite) return [];

  let query = 'SELECT * FROM knowledge_edges WHERE to_id = ? AND to_kind = ?';
  const params: any[] = [nodeId, nodeKind];

  if (edgeType) {
    query += ' AND edge_type = ?';
    params.push(edgeType);
  }

  query += ' ORDER BY weight DESC';

  return sqlite.prepare(query).all(...params).map(toKnowledgeEdge);
}

/**
 * Get all edges connected to a node (both directions).
 */
export async function getEdgesForNode(
  nodeId: string,
  nodeKind: EdgeNodeKind
): Promise<KnowledgeEdge[]> {
  await ensureKnowledgeTables();
  const { raw } = await getDbClient();
  const sqlite = (raw as any).$client;
  if (!sqlite) return [];

  const rows = sqlite.prepare(`
    SELECT * FROM knowledge_edges
    WHERE (from_id = ? AND from_kind = ?) OR (to_id = ? AND to_kind = ?)
    ORDER BY weight DESC
  `).all(nodeId, nodeKind, nodeId, nodeKind);

  return rows.map(toKnowledgeEdge);
}

/**
 * Delete an edge by ID.
 */
export async function deleteKnowledgeEdge(id: string): Promise<boolean> {
  await ensureKnowledgeTables();
  const { raw } = await getDbClient();
  const sqlite = (raw as any).$client;
  if (!sqlite) return false;

  const result = sqlite.prepare('DELETE FROM knowledge_edges WHERE id = ?').run(id);
  return result.changes > 0;
}

/**
 * Delete all edges from/to a node (used during cleanup).
 */
export async function deleteEdgesForNode(nodeId: string, nodeKind: EdgeNodeKind): Promise<number> {
  await ensureKnowledgeTables();
  const { raw } = await getDbClient();
  const sqlite = (raw as any).$client;
  if (!sqlite) return 0;

  const r1 = sqlite.prepare('DELETE FROM knowledge_edges WHERE from_id = ? AND from_kind = ?').run(nodeId, nodeKind);
  const r2 = sqlite.prepare('DELETE FROM knowledge_edges WHERE to_id = ? AND to_kind = ?').run(nodeId, nodeKind);
  return r1.changes + r2.changes;
}

/**
 * Get connected entities for a knowledge record.
 *
 * Finds entity IDs linked to this knowledge via knowledge_edges, then returns
 * other knowledge records that also reference those same entities — giving
 * callers a transitive view of the knowledge graph through shared entities.
 */
export async function getConnectedEntities(knowledgeId: string): Promise<Knowledge[]> {
  await ensureKnowledgeTables();
  const { raw } = await getDbClient();
  const sqlite = (raw as any).$client;
  if (!sqlite) return [];

  // Collect entity IDs from both outgoing and incoming edges
  const outgoingEdges = sqlite.prepare(`
    SELECT to_id AS entity_id FROM knowledge_edges
    WHERE from_id = ? AND from_kind = 'knowledge' AND to_kind = 'entity'
  `).all(knowledgeId) as { entity_id: string }[];

  const incomingEdges = sqlite.prepare(`
    SELECT from_id AS entity_id FROM knowledge_edges
    WHERE to_id = ? AND to_kind = 'knowledge' AND from_kind = 'entity'
  `).all(knowledgeId) as { entity_id: string }[];

  const entityIds = [
    ...outgoingEdges.map(e => e.entity_id),
    ...incomingEdges.map(e => e.entity_id),
  ];

  if (entityIds.length === 0) return [];

  // For each entity, find other knowledge records connected to it
  const knowledgeIds = new Set<string>();
  const placeholders = entityIds.map(() => '?').join(',');

  // Knowledge → Entity edges (knowledge is the source)
  const fromKnowledge = sqlite.prepare(`
    SELECT DISTINCT from_id AS knowledge_id FROM knowledge_edges
    WHERE to_id IN (${placeholders}) AND to_kind = 'entity' AND from_kind = 'knowledge'
  `).all(...entityIds) as { knowledge_id: string }[];

  // Entity → Knowledge edges (knowledge is the target)
  const toKnowledgeRows = sqlite.prepare(`
    SELECT DISTINCT to_id AS knowledge_id FROM knowledge_edges
    WHERE from_id IN (${placeholders}) AND from_kind = 'entity' AND to_kind = 'knowledge'
  `).all(...entityIds) as { knowledge_id: string }[];

  for (const row of fromKnowledge) {
    if (row.knowledge_id !== knowledgeId) knowledgeIds.add(row.knowledge_id);
  }
  for (const row of toKnowledgeRows) {
    if (row.knowledge_id !== knowledgeId) knowledgeIds.add(row.knowledge_id);
  }

  if (knowledgeIds.size === 0) return [];

  // Fetch the connected knowledge records
  const ids = Array.from(knowledgeIds);
  const fetchPlaceholders = ids.map(() => '?').join(',');
  const rows = sqlite.prepare(`
    SELECT * FROM knowledge
    WHERE id IN (${fetchPlaceholders}) AND is_active = 1
    ORDER BY updated_at DESC
    LIMIT 50
  `).all(...ids);

  return rows.map(toKnowledge);
}

/**
 * Get connected places for a knowledge record.
 *
 * Finds place IDs linked to this knowledge via knowledge_edges, then returns
 * other knowledge records that share those same places — either via edges
 * or via the knowledge table's place_id / primary_place columns.
 */
export async function getConnectedPlaces(knowledgeId: string): Promise<Knowledge[]> {
  await ensureKnowledgeTables();
  const { raw } = await getDbClient();
  const sqlite = (raw as any).$client;
  if (!sqlite) return [];

  // Collect place IDs from both outgoing and incoming edges
  const outgoingEdges = sqlite.prepare(`
    SELECT to_id AS place_id FROM knowledge_edges
    WHERE from_id = ? AND from_kind = 'knowledge' AND to_kind = 'place'
  `).all(knowledgeId) as { place_id: string }[];

  const incomingEdges = sqlite.prepare(`
    SELECT from_id AS place_id FROM knowledge_edges
    WHERE to_id = ? AND to_kind = 'knowledge' AND from_kind = 'place'
  `).all(knowledgeId) as { place_id: string }[];

  const placeIds = [
    ...outgoingEdges.map(e => e.place_id),
    ...incomingEdges.map(e => e.place_id),
  ];

  if (placeIds.length === 0) return [];

  const knowledgeIds = new Set<string>();
  const placeholders = placeIds.map(() => '?').join(',');

  // Knowledge → Place edges (knowledge is the source)
  const fromKnowledge = sqlite.prepare(`
    SELECT DISTINCT from_id AS knowledge_id FROM knowledge_edges
    WHERE to_id IN (${placeholders}) AND to_kind = 'place' AND from_kind = 'knowledge'
  `).all(...placeIds) as { knowledge_id: string }[];

  // Place → Knowledge edges (knowledge is the target)
  const toKnowledgeRows = sqlite.prepare(`
    SELECT DISTINCT to_id AS knowledge_id FROM knowledge_edges
    WHERE from_id IN (${placeholders}) AND from_kind = 'place' AND to_kind = 'knowledge'
  `).all(...placeIds) as { knowledge_id: string }[];

  // Also find knowledge records that reference these places via columns
  const columnMatches = sqlite.prepare(`
    SELECT id AS knowledge_id FROM knowledge
    WHERE (place_id IN (${placeholders}) OR primary_place IN (${placeholders}))
      AND is_active = 1
  `).all(...placeIds, ...placeIds) as { knowledge_id: string }[];

  for (const row of fromKnowledge) {
    if (row.knowledge_id !== knowledgeId) knowledgeIds.add(row.knowledge_id);
  }
  for (const row of toKnowledgeRows) {
    if (row.knowledge_id !== knowledgeId) knowledgeIds.add(row.knowledge_id);
  }
  for (const row of columnMatches) {
    if (row.knowledge_id !== knowledgeId) knowledgeIds.add(row.knowledge_id);
  }

  if (knowledgeIds.size === 0) return [];

  // Fetch the connected knowledge records
  const ids = Array.from(knowledgeIds);
  const fetchPlaceholders = ids.map(() => '?').join(',');
  const rows = sqlite.prepare(`
    SELECT * FROM knowledge
    WHERE id IN (${fetchPlaceholders}) AND is_active = 1
    ORDER BY updated_at DESC
    LIMIT 50
  `).all(...ids);

  return rows.map(toKnowledge);
}

// ─── Belief Adapter Functions ──────────────────────────────────────────────
// These bridge the old beliefs/ API to the unified knowledge table.
// Consumers (agent-hooks, explain, trust-state) import these instead of
// the old beliefs/store.js module.

/**
 * Upsert beliefs extracted from a memory into the knowledge table.
 * Creates knowledge records of kind='belief' and links them to the source
 * memory via knowledge_edges.
 */
export async function upsertBeliefsForMemory(input: {
  projectId?: string;
  memoryId: string;
  beliefs: ExtractedBelief[];
}): Promise<StoredBelief[]> {
  const stored: StoredBelief[] = [];
  for (const belief of input.beliefs) {
    const normalizedKey = belief.statement
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 200);

    // Check for existing belief with same normalized key in the project
    const existing = input.projectId
      ? await searchKnowledge({
          contentQuery: normalizedKey,
          projectId: input.projectId,
          kinds: ['belief'],
          limit: 1,
        })
      : [];

    let knowledge: Knowledge;
    if (existing.length > 0 && existing[0].normalizedKey === normalizedKey) {
      // Update existing
      const nextStatus = belief.type === 'failure_cause' ? 'disputed'
        : existing[0].knowledgeType !== belief.type && existing[0].content !== belief.statement ? 'superseded'
        : existing[0].status;
      await updateKnowledge(existing[0].id, {
        confidence: Math.max(existing[0].confidence, belief.confidence),
        status: nextStatus,
        reason: belief.reason ?? undefined,
        evidenceSummary: belief.evidenceSummary ?? undefined,
        sourceCount: (existing[0].sourceCount ?? 0) + 1,
      });
      knowledge = (await getKnowledgeById(existing[0].id))!;
    } else {
      // Create new
      knowledge = await createKnowledge({
        projectId: input.projectId,
        knowledgeKind: 'belief',
        knowledgeType: belief.type,
        content: belief.statement,
        normalizedKey,
        confidence: belief.confidence,
        status: belief.status,
        reason: belief.reason,
        evidenceSummary: belief.evidenceSummary,
        tags: ['auto-extracted'],
      });
    }

    // Link belief to source memory via knowledge_edges
    try {
      await createKnowledgeEdge({
        fromId: knowledge.id,
        fromKind: 'knowledge',
        toId: input.memoryId,
        toKind: 'knowledge',
        edgeType: 'sourced_from',
      });
    } catch { /* edge may already exist */ }

    stored.push(knowledgeToStoredBelief(knowledge));
  }

  return stored;
}

/**
 * Get all beliefs linked to a specific memory via knowledge_edges.
 */
export async function getBeliefsForMemory(memoryId: string): Promise<StoredBelief[]> {
  await ensureKnowledgeTables();
  const { raw } = await getDbClient();
  const sqlite = (raw as any).$client;
  if (!sqlite) return [];

  // Find knowledge edges where this memory is the target
  const edges = sqlite.prepare(`
    SELECT from_id FROM knowledge_edges
    WHERE to_id = ? AND to_kind = 'knowledge' AND from_kind = 'knowledge' AND edge_type = 'sourced_from'
  `).all(memoryId) as { from_id: string }[];

  if (edges.length === 0) return [];

  const beliefIds = edges.map(e => e.from_id);
  const placeholders = beliefIds.map(() => '?').join(',');
  const rows = sqlite.prepare(`
    SELECT * FROM knowledge
    WHERE id IN (${placeholders}) AND knowledge_kind = 'belief'
    ORDER BY updated_at DESC
  `).all(...beliefIds) as any[];

  return rows.map(row => knowledgeToStoredBelief(toKnowledge(row)));
}

/**
 * Get active constraint beliefs for session boot.
 * Returns beliefs that should shape next actions.
 */
export async function getActiveConstraints(projectId: string): Promise<StoredBelief[]> {
  const rows = await listKnowledgeByKind(projectId, 'belief', {
    status: 'active',
    types: ['constraint'],
    limit: 20,
  });
  return rows.map(knowledgeToStoredBelief);
}

/**
 * Get active decision beliefs for session boot.
 * Returns decisions that should guide next actions.
 */
export async function getActiveDecisions(projectId: string): Promise<StoredBelief[]> {
  const rows = await listKnowledgeByKind(projectId, 'belief', {
    status: 'active',
    types: ['decision'],
    limit: 20,
  });
  return rows.map(knowledgeToStoredBelief);
}

/**
 * Get recent failure beliefs for session boot.
 * Returns failure_cause beliefs to avoid repeating mistakes.
 */
export async function getRecentFailures(projectId: string, count: number = 10): Promise<StoredBelief[]> {
  const rows = await listKnowledgeByKind(projectId, 'belief', {
    status: 'active',
    types: ['failure_cause'],
    limit: count,
  });
  return rows.map(knowledgeToStoredBelief);
}

/**
 * Search beliefs by content.
 */
export async function searchBeliefs(
  projectId: string,
  query: string,
  options?: { type?: string; minConfidence?: number; limit?: number },
): Promise<StoredBelief[]> {
  const rows = await searchKnowledge({
    contentQuery: query,
    projectId,
    kinds: ['belief'],
    limit: options?.limit ?? 50,
  });
  let filtered = rows;
  if (options?.type) {
    filtered = filtered.filter(r => r.knowledgeType === options.type);
  }
  if (options?.minConfidence !== undefined) {
    filtered = filtered.filter(r => r.confidence >= options.minConfidence!);
  }
  return filtered.map(knowledgeToStoredBelief);
}

/**
 * Get all beliefs for a project.
 */
export async function getAllBeliefs(
  projectId: string,
  options?: { type?: string; status?: string; minConfidence?: number; limit?: number },
): Promise<StoredBelief[]> {
  const rows = await listKnowledgeByKind(projectId, 'belief', {
    limit: options?.limit ?? 100,
  });
  let filtered = rows;
  if (options?.type) {
    filtered = filtered.filter(r => r.knowledgeType === options.type);
  }
  if (options?.status) {
    filtered = filtered.filter(r => r.status === options.status);
  }
  if (options?.minConfidence !== undefined) {
    filtered = filtered.filter(r => r.confidence >= options.minConfidence!);
  }
  return filtered.map(knowledgeToStoredBelief);
}

/**
 * Get beliefs relevant to a task/query for session boot.
 */
export async function getRelevantBeliefs(
  projectId: string,
  taskQuery: string,
  limit: number = 10,
): Promise<StoredBelief[]> {
  const rows = await searchKnowledge({
    contentQuery: taskQuery,
    projectId,
    kinds: ['belief'],
    status: 'active',
    limit,
  });
  return rows.map(knowledgeToStoredBelief);
}

function knowledgeToStoredBelief(k: Knowledge): StoredBelief {
  return {
    id: k.id,
    projectId: k.projectId ?? '',
    type: k.knowledgeType as BeliefKnowledgeType,
    statement: k.content,
    normalizedKey: k.normalizedKey ?? '',
    confidence: k.confidence,
    status: k.status,
    reason: k.reason ?? undefined,
    context: undefined,
    evidenceSummary: k.evidenceSummary ?? undefined,
    sourceMemoryIds: [],
    lastConfirmedAt: k.lastConfirmedAt ? new Date(k.lastConfirmedAt) : null,
    sourceCount: k.sourceCount,
    beliefDecayRate: k.importanceDecayRate,
    createdAt: k.createdAt,
    updatedAt: k.updatedAt,
  };
}
