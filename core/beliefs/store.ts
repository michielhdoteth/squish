import { randomUUID } from 'crypto';
import { getDbClient } from '../lib/db-client.js';
import { deserializeMetadata, serializeMetadata } from '../memory/serialization.js';
import type { ExtractedBelief, StoredBelief } from './types.js';

async function ensureBeliefTables(): Promise<void> {
  const { raw } = await getDbClient();
  const sqlite = (raw as any).$client;
  if (sqlite && typeof sqlite.exec === 'function') {
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS beliefs (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        belief_type TEXT NOT NULL,
        statement TEXT NOT NULL,
        normalized_key TEXT NOT NULL,
        confidence REAL DEFAULT 0.5,
        status TEXT DEFAULT 'active',
        reason TEXT,
        context TEXT,
        evidence_summary TEXT,
        metadata TEXT,
        created_at INTEGER DEFAULT (strftime('%s','now')) NOT NULL,
        updated_at INTEGER DEFAULT (strftime('%s','now')) NOT NULL,
        UNIQUE(project_id, normalized_key)
      );
      CREATE INDEX IF NOT EXISTS beliefs_project_idx ON beliefs(project_id);
      CREATE INDEX IF NOT EXISTS beliefs_type_idx ON beliefs(belief_type);
      CREATE INDEX IF NOT EXISTS beliefs_status_idx ON beliefs(status);

      CREATE TABLE IF NOT EXISTS belief_memory_sources (
        id TEXT PRIMARY KEY,
        belief_id TEXT NOT NULL,
        memory_id TEXT NOT NULL,
        created_at INTEGER DEFAULT (strftime('%s','now')) NOT NULL,
        UNIQUE(belief_id, memory_id)
      );
      CREATE INDEX IF NOT EXISTS belief_memory_sources_belief_idx ON belief_memory_sources(belief_id);
      CREATE INDEX IF NOT EXISTS belief_memory_sources_memory_idx ON belief_memory_sources(memory_id);

      CREATE TABLE IF NOT EXISTS belief_edges (
        id TEXT PRIMARY KEY,
        from_belief_id TEXT NOT NULL,
        to_belief_id TEXT NOT NULL,
        edge_type TEXT NOT NULL,
        metadata TEXT,
        created_at INTEGER DEFAULT (strftime('%s','now')) NOT NULL,
        UNIQUE(from_belief_id, to_belief_id, edge_type)
      );
      CREATE INDEX IF NOT EXISTS belief_edges_from_idx ON belief_edges(from_belief_id);
      CREATE INDEX IF NOT EXISTS belief_edges_to_idx ON belief_edges(to_belief_id);
    `);
    return;
  }

  if (typeof (raw as any).query === 'function') {
    await (raw as any).query(`
      CREATE TABLE IF NOT EXISTS beliefs (
        id UUID PRIMARY KEY,
        project_id UUID NOT NULL,
        belief_type TEXT NOT NULL,
        statement TEXT NOT NULL,
        normalized_key TEXT NOT NULL,
        confidence REAL DEFAULT 0.5,
        status TEXT DEFAULT 'active',
        reason TEXT,
        context TEXT,
        evidence_summary TEXT,
        metadata JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
        UNIQUE(project_id, normalized_key)
      );
      CREATE INDEX IF NOT EXISTS beliefs_project_idx ON beliefs(project_id);
      CREATE INDEX IF NOT EXISTS beliefs_type_idx ON beliefs(belief_type);
      CREATE INDEX IF NOT EXISTS beliefs_status_idx ON beliefs(status);

      CREATE TABLE IF NOT EXISTS belief_memory_sources (
        id UUID PRIMARY KEY,
        belief_id UUID NOT NULL REFERENCES beliefs(id) ON DELETE CASCADE,
        memory_id UUID NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
        UNIQUE(belief_id, memory_id)
      );
      CREATE INDEX IF NOT EXISTS belief_memory_sources_belief_idx ON belief_memory_sources(belief_id);
      CREATE INDEX IF NOT EXISTS belief_memory_sources_memory_idx ON belief_memory_sources(memory_id);

      CREATE TABLE IF NOT EXISTS belief_edges (
        id UUID PRIMARY KEY,
        from_belief_id UUID NOT NULL REFERENCES beliefs(id) ON DELETE CASCADE,
        to_belief_id UUID NOT NULL REFERENCES beliefs(id) ON DELETE CASCADE,
        edge_type TEXT NOT NULL,
        metadata JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
        UNIQUE(from_belief_id, to_belief_id, edge_type)
      );
      CREATE INDEX IF NOT EXISTS belief_edges_from_idx ON belief_edges(from_belief_id);
      CREATE INDEX IF NOT EXISTS belief_edges_to_idx ON belief_edges(to_belief_id);
    `);
  }
}

function normalizeBeliefKey(belief: Pick<ExtractedBelief, 'type' | 'statement'>): string {
  return `${belief.type}:${belief.statement.toLowerCase().replace(/\s+/g, ' ').trim()}`;
}

export async function upsertBeliefsForMemory(input: {
  projectId: string;
  memoryId: string;
  beliefs: ExtractedBelief[];
}): Promise<StoredBelief[]> {
  await ensureBeliefTables();
  const { raw } = await getDbClient();
  const sqlite = (raw as any).$client;
  if (!sqlite && typeof (raw as any).query !== 'function') return [];

  const stored: StoredBelief[] = [];

  if (!sqlite && typeof (raw as any).query === 'function') {
    const pg = raw as any;
    for (const belief of input.beliefs) {
      const normalizedKey = normalizeBeliefKey(belief);
      const existingResult = await pg.query(
        `SELECT * FROM beliefs WHERE project_id = $1 AND normalized_key = $2 LIMIT 1`,
        [input.projectId, normalizedKey],
      );
      const existing = existingResult.rows[0];
      const beliefId = existing?.id ?? randomUUID();
      const nextStatus =
        existing
          ? (belief.type === 'dispute' ? 'disputed' : existing.status || belief.status)
          : belief.status;

      if (existing) {
        await pg.query(
          `UPDATE beliefs
           SET confidence = $1, status = $2, reason = $3, context = $4, evidence_summary = $5, metadata = $6, updated_at = NOW()
           WHERE id = $7`,
          [
            Math.max(Number(existing.confidence ?? 0.5), belief.confidence),
            nextStatus,
            belief.reason ?? null,
            belief.context ?? null,
            belief.evidenceSummary ?? null,
            { edges: belief.edges ?? [] },
            beliefId,
          ],
        );
      } else {
        await pg.query(
          `INSERT INTO beliefs (id, project_id, belief_type, statement, normalized_key, confidence, status, reason, context, evidence_summary, metadata)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [
            beliefId,
            input.projectId,
            belief.type,
            belief.statement,
            normalizedKey,
            belief.confidence,
            belief.status,
            belief.reason ?? null,
            belief.context ?? null,
            belief.evidenceSummary ?? null,
            { edges: belief.edges ?? [] },
          ],
        );
      }

      await pg.query(
        `INSERT INTO belief_memory_sources (id, belief_id, memory_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (belief_id, memory_id) DO NOTHING`,
        [randomUUID(), beliefId, input.memoryId],
      );

      stored.push({
        id: beliefId,
        projectId: input.projectId,
        normalizedKey,
        ...belief,
        status: nextStatus,
      });
    }
    return stored;
  }

  for (const belief of input.beliefs) {
    const normalizedKey = normalizeBeliefKey(belief);
    const existing = sqlite.prepare(`
      SELECT * FROM beliefs WHERE project_id = ? AND normalized_key = ? LIMIT 1
    `).get(input.projectId, normalizedKey) as any;

    let beliefId = existing?.id ?? randomUUID();
    let status = belief.status;

    if (existing) {
      const nextStatus =
        belief.type === 'dispute' ? 'disputed'
        : existing.belief_type === belief.type && existing.statement !== belief.statement ? 'superseded'
        : existing.status || belief.status;
      sqlite.prepare(`
        UPDATE beliefs
        SET confidence = ?, status = ?, reason = ?, context = ?, evidence_summary = ?, metadata = ?, updated_at = (strftime('%s','now'))
        WHERE id = ?
      `).run(
        Math.max(existing.confidence ?? 0.5, belief.confidence),
        nextStatus,
        belief.reason ?? null,
        belief.context ?? null,
        belief.evidenceSummary ?? null,
        serializeMetadata({ edges: belief.edges ?? [] }),
        beliefId,
      );
      status = nextStatus as StoredBelief['status'];
    } else {
      sqlite.prepare(`
        INSERT INTO beliefs (id, project_id, belief_type, statement, normalized_key, confidence, status, reason, context, evidence_summary, metadata)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        beliefId,
        input.projectId,
        belief.type,
        belief.statement,
        normalizedKey,
        belief.confidence,
        belief.status,
        belief.reason ?? null,
        belief.context ?? null,
        belief.evidenceSummary ?? null,
        serializeMetadata({ edges: belief.edges ?? [] }),
      );
    }

    sqlite.prepare(`
      INSERT OR IGNORE INTO belief_memory_sources (id, belief_id, memory_id)
      VALUES (?, ?, ?)
    `).run(randomUUID(), beliefId, input.memoryId);

    stored.push({
      id: beliefId,
      projectId: input.projectId,
      normalizedKey,
      ...belief,
      status,
    });
  }

  for (const belief of stored) {
    const edgeMetadata = deserializeMetadata((sqlite.prepare(`SELECT metadata FROM beliefs WHERE id = ?`).get(belief.id) as any)?.metadata ?? null) as any;
    const edges = Array.isArray(edgeMetadata?.edges) ? edgeMetadata.edges : [];
    for (const edge of edges) {
      const target = stored.find((candidate) => candidate.statement === edge.targetStatement);
      if (!target || target.id === belief.id) continue;
      sqlite.prepare(`
        INSERT OR IGNORE INTO belief_edges (id, from_belief_id, to_belief_id, edge_type, metadata)
        VALUES (?, ?, ?, ?, ?)
      `).run(randomUUID(), belief.id, target.id, edge.type, serializeMetadata({}));
    }
  }

  return stored;
}

export async function getBeliefsForMemory(memoryId: string): Promise<StoredBelief[]> {
  await ensureBeliefTables();
  const { raw } = await getDbClient();
  const sqlite = (raw as any).$client;
  if (!sqlite && typeof (raw as any).query !== 'function') return [];

  if (!sqlite && typeof (raw as any).query === 'function') {
    const result = await (raw as any).query(`
      SELECT b.*, array_agg(bms.memory_id) as source_memory_ids
      FROM beliefs b
      JOIN belief_memory_sources bms ON bms.belief_id = b.id
      WHERE b.id IN (
        SELECT belief_id FROM belief_memory_sources WHERE memory_id = $1
      )
      GROUP BY b.id
      ORDER BY b.updated_at DESC
    `, [memoryId]);
    return result.rows.map((row: any) => ({
      id: row.id,
      projectId: row.project_id,
      type: row.belief_type,
      statement: row.statement,
      normalizedKey: row.normalized_key,
      confidence: Number(row.confidence ?? 0.5),
      status: row.status,
      reason: row.reason ?? undefined,
      context: row.context ?? undefined,
      evidenceSummary: row.evidence_summary ?? undefined,
      sourceMemoryIds: row.source_memory_ids ?? [],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  const rows = sqlite.prepare(`
    SELECT b.*, group_concat(bms.memory_id) as source_memory_ids
    FROM beliefs b
    JOIN belief_memory_sources bms ON bms.belief_id = b.id
    WHERE b.id IN (
      SELECT belief_id FROM belief_memory_sources WHERE memory_id = ?
    )
    GROUP BY b.id
    ORDER BY b.updated_at DESC
  `).all(memoryId) as any[];

  return rows.map((row) => ({
    id: row.id,
    projectId: row.project_id,
    type: row.belief_type,
    statement: row.statement,
    normalizedKey: row.normalized_key,
    confidence: Number(row.confidence ?? 0.5),
    status: row.status,
    reason: row.reason ?? undefined,
    context: row.context ?? undefined,
    evidenceSummary: row.evidence_summary ?? undefined,
    sourceMemoryIds: String(row.source_memory_ids ?? '').split(',').filter(Boolean),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

/**
 * Get all beliefs for a project
 */
export async function getAllBeliefs(projectId: string, options?: {
  type?: string;
  status?: string;
  minConfidence?: number;
  limit?: number;
}): Promise<StoredBelief[]> {
  await ensureBeliefTables();
  const { raw } = await getDbClient();
  const sqlite = (raw as any).$client;
  const isPg = typeof (raw as any).query === 'function';
  if (!sqlite && !isPg) return [];

  const limit = options?.limit ?? 100;
  const conditions: string[] = ['project_id = ?'];
  const params: any[] = [projectId];

  if (options?.type) {
    conditions.push('belief_type = ?');
    params.push(options.type);
  }
  if (options?.status) {
    conditions.push('status = ?');
    params.push(options.status);
  }
  if (options?.minConfidence !== undefined) {
    conditions.push('confidence >= ?');
    params.push(options.minConfidence);
  }

  const whereClause = conditions.join(' AND ');
  const sql = `
    SELECT * FROM beliefs 
    WHERE ${whereClause}
    ORDER BY confidence DESC, updated_at DESC
    LIMIT ?
  `;
  params.push(limit);

  if (isPg) {
    const result = await (raw as any).query(sql, params);
    return result.rows.map((row: any) => ({
      id: row.id,
      projectId: row.project_id,
      type: row.belief_type,
      statement: row.statement,
      normalizedKey: row.normalized_key,
      confidence: Number(row.confidence ?? 0.5),
      status: row.status,
      reason: row.reason ?? undefined,
      context: row.context ?? undefined,
      evidenceSummary: row.evidence_summary ?? undefined,
      sourceMemoryIds: [],
      lastConfirmedAt: row.last_confirmed_at,
      sourceCount: row.source_count,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  const rows = sqlite.prepare(sql).all(...params) as any[];
  return rows.map((row) => ({
    id: row.id,
    projectId: row.project_id,
    type: row.belief_type,
    statement: row.statement,
    normalizedKey: row.normalized_key,
    confidence: Number(row.confidence ?? 0.5),
    status: row.status,
    reason: row.reason ?? undefined,
    context: row.context ?? undefined,
    evidenceSummary: row.evidence_summary ?? undefined,
    sourceMemoryIds: [],
    lastConfirmedAt: row.last_confirmed_at,
    sourceCount: row.source_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

/**
 * Search beliefs by statement content
 */
export async function searchBeliefs(projectId: string, query: string, options?: {
  type?: string;
  minConfidence?: number;
  limit?: number;
}): Promise<StoredBelief[]> {
  await ensureBeliefTables();
  const { raw } = await getDbClient();
  const sqlite = (raw as any).$client;
  const isPg = typeof (raw as any).query === 'function';
  if (!sqlite && !isPg) return [];

  const limit = options?.limit ?? 50;
  const conditions: string[] = ['project_id = ?', 'statement LIKE ?'];
  const params: any[] = [projectId, `%${query}%`];

  if (options?.type) {
    conditions.push('belief_type = ?');
    params.push(options.type);
  }
  if (options?.minConfidence !== undefined) {
    conditions.push('confidence >= ?');
    params.push(options.minConfidence);
  }

  const whereClause = conditions.join(' AND ');
  const sql = `
    SELECT * FROM beliefs 
    WHERE ${whereClause}
    ORDER BY confidence DESC
    LIMIT ?
  `;
  params.push(limit);

  if (isPg) {
    const result = await (raw as any).query(sql, params);
    return result.rows.map((row: any) => ({
      id: row.id,
      projectId: row.project_id,
      type: row.belief_type,
      statement: row.statement,
      normalizedKey: row.normalized_key,
      confidence: Number(row.confidence ?? 0.5),
      status: row.status,
      reason: row.reason ?? undefined,
      context: row.context ?? undefined,
      evidenceSummary: row.evidence_summary ?? undefined,
      sourceMemoryIds: [],
      sourceCount: row.source_count,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  const rows = sqlite.prepare(sql).all(...params) as any[];
  return rows.map((row) => ({
    id: row.id,
    projectId: row.project_id,
    type: row.belief_type,
    statement: row.statement,
    normalizedKey: row.normalized_key,
    confidence: Number(row.confidence ?? 0.5),
    status: row.status,
    reason: row.reason ?? undefined,
    context: row.context ?? undefined,
    evidenceSummary: row.evidence_summary ?? undefined,
    sourceMemoryIds: [],
    sourceCount: row.source_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}
