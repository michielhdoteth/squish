/**
 * Knowledge Edges — CRUD and graph traversal for knowledge_edges.
 *
 * Single responsibility: managing relationships between knowledge, entities,
 * and places. Includes cross-entity queries like getConnectedEntities and
 * getConnectedPlaces that traverse the knowledge graph.
 */

import { randomUUID } from 'crypto';
import { getDbClient } from '../lib/db-client.js';
import { serializeJson, toKnowledge, toKnowledgeEdge } from './helpers.js';
import { ensureKnowledgeTables } from './knowledge-crud.js';
import type {
  Knowledge,
  KnowledgeEdge,
  CreateKnowledgeEdgeInput,
  EdgeNodeKind,
} from './types.js';

// ─── Edge CRUD ───────────────────────────────────────────────────────────────

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

// ─── Graph Traversal ─────────────────────────────────────────────────────────

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
