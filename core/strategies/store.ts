import { randomUUID } from 'crypto';
import { getDbClient } from '../lib/db-client.js';
import { logger } from '../logger.js';
import type {
  Strategy,
  StrategyType,
  StrategyStatus,
  StrategyEdgeType,
  StrategyBeliefEdgeType,
  CreateStrategyInput,
} from './types.js';

/**
 * Ensure strategy tables exist by checking and creating if needed.
 * Follows the same pattern as runBeliefMigrations() in db/migrations/beliefs.ts.
 */
async function ensureStrategyTables(): Promise<void> {
  const { raw } = await getDbClient();
  const sqlite = (raw as any).$client;

  if (sqlite && typeof sqlite.prepare === 'function') {
    const tableCheck = sqlite.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='strategies'"
    ).get() as { name: string } | undefined;

    if (!tableCheck) {
      // Create strategies table for existing databases upgrading to strategies support
      logger.info('Migration: Creating strategies tables for existing database');
      try {
        sqlite.exec(`
          CREATE TABLE IF NOT EXISTS strategies (
            id TEXT PRIMARY KEY,
            project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
            user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
            agent_id TEXT,
            strategy_type TEXT NOT NULL,
            title TEXT NOT NULL,
            description TEXT NOT NULL,
            context TEXT,
            steps TEXT,
            success_criteria TEXT,
            failure_indicators TEXT,
            confidence REAL DEFAULT 0.5,
            usage_count INTEGER DEFAULT 0,
            success_count INTEGER DEFAULT 0,
            failure_count INTEGER DEFAULT 0,
            last_used_at INTEGER,
            last_success_at INTEGER,
            last_failure_at INTEGER,
            status TEXT DEFAULT 'active',
            superseded_by TEXT,
            tags TEXT,
            metadata TEXT,
            visibility_scope TEXT DEFAULT 'private',
            created_at INTEGER DEFAULT (strftime('%s','now')) NOT NULL,
            updated_at INTEGER DEFAULT (strftime('%s','now')) NOT NULL
          )
        `);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.warn(`Migration: Could not create strategies table: ${msg}`);
      }
    }

    // Ensure strategy_edges table exists
    const edgesCheck = sqlite.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='strategy_edges'"
    ).get() as { name: string } | undefined;

    if (!edgesCheck) {
      try {
        sqlite.exec(`
          CREATE TABLE IF NOT EXISTS strategy_edges (
            id TEXT PRIMARY KEY,
            from_strategy_id TEXT REFERENCES strategies(id) ON DELETE CASCADE,
            to_strategy_id TEXT REFERENCES strategies(id) ON DELETE CASCADE,
            edge_type TEXT NOT NULL,
            metadata TEXT,
            created_at INTEGER DEFAULT (strftime('%s','now')) NOT NULL,
            UNIQUE(from_strategy_id, to_strategy_id, edge_type)
          )
        `);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.warn(`Migration: Could not create strategy_edges table: ${msg}`);
      }
    }

    // Ensure strategy_belief_edges table exists
    const beliefEdgesCheck = sqlite.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='strategy_belief_edges'"
    ).get() as { name: string } | undefined;

    if (!beliefEdgesCheck) {
      try {
        sqlite.exec(`
          CREATE TABLE IF NOT EXISTS strategy_belief_edges (
            id TEXT PRIMARY KEY,
            strategy_id TEXT REFERENCES strategies(id) ON DELETE CASCADE,
            belief_id TEXT REFERENCES beliefs(id) ON DELETE CASCADE,
            edge_type TEXT NOT NULL,
            metadata TEXT,
            created_at INTEGER DEFAULT (strftime('%s','now')) NOT NULL,
            UNIQUE(strategy_id, belief_id, edge_type)
          )
        `);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.warn(`Migration: Could not create strategy_belief_edges table: ${msg}`);
      }
    }

    return;
  }

  if (typeof (raw as any).query === 'function') {
    const result = await (raw as any).query(
      "SELECT table_name FROM information_schema.tables WHERE table_name = 'strategies' LIMIT 1"
    );
    if (!result.rows[0]) {
      throw new Error('Strategies table does not exist for PostgreSQL. Run database migrations.');
    }
  }
}

/**
 * Map a database row to a Strategy object.
 */
function mapRowToStrategy(row: any): Strategy {
  return {
    id: row.id,
    projectId: row.project_id,
    userId: row.user_id,
    agentId: row.agent_id,
    strategyType: row.strategy_type,
    title: row.title,
    description: row.description,
    context: row.context ?? null,
    steps: row.steps ?? null,
    successCriteria: row.success_criteria ?? null,
    failureIndicators: row.failure_indicators ?? null,
    confidence: Number(row.confidence ?? 0.5),
    usageCount: Number(row.usage_count ?? 0),
    successCount: Number(row.success_count ?? 0),
    failureCount: Number(row.failure_count ?? 0),
    lastUsedAt: row.last_used_at ? new Date(row.last_used_at) : null,
    lastSuccessAt: row.last_success_at ? new Date(row.last_success_at) : null,
    lastFailureAt: row.last_failure_at ? new Date(row.last_failure_at) : null,
    status: (row.status ?? 'active') as StrategyStatus,
    supersededBy: row.superseded_by ?? null,
    tags: row.tags ?? null,
    metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata ?? null,
    visibilityScope: row.visibility_scope ?? 'private',
    createdAt: row.created_at ? new Date(row.created_at) : new Date(),
    updatedAt: row.updated_at ? new Date(row.updated_at) : new Date(),
  };
}

/**
 * Create a new strategy.
 */
export async function createStrategy(input: CreateStrategyInput): Promise<Strategy> {
  await ensureStrategyTables();
  const { raw } = await getDbClient();
  const sqlite = (raw as any).$client;
  const isPg = typeof (raw as any).query === 'function';

  const id = randomUUID();
  const now = Date.now();
  const stepsJson = input.steps ? JSON.stringify(input.steps) : null;
  const tagsStr = input.tags ? JSON.stringify(input.tags) : null;
  const metadataJson = input.metadata ? JSON.stringify(input.metadata) : null;

  const strategyData = {
    id,
    projectId: input.projectId ?? null,
    userId: input.userId ?? null,
    agentId: input.agentId ?? null,
    strategyType: input.strategyType,
    title: input.title,
    description: input.description,
    context: input.context ?? null,
    steps: stepsJson,
    successCriteria: input.successCriteria ?? null,
    failureIndicators: input.failureIndicators ?? null,
    confidence: input.confidence ?? 0.5,
    usageCount: 0,
    successCount: 0,
    failureCount: 0,
    status: 'active',
    tags: tagsStr,
    metadata: metadataJson,
    visibilityScope: input.visibilityScope ?? 'private',
  };

  if (isPg) {
    const pg = raw as any;
    await pg.query(
      `INSERT INTO strategies (id, project_id, user_id, agent_id, strategy_type, title, description, context, steps, success_criteria, failure_indicators, confidence, usage_count, success_count, failure_count, status, tags, metadata, visibility_scope, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, NOW(), NOW())`,
      [
        id, strategyData.projectId, strategyData.userId, strategyData.agentId,
        strategyData.strategyType, strategyData.title, strategyData.description,
        strategyData.context, strategyData.steps, strategyData.successCriteria,
        strategyData.failureIndicators, strategyData.confidence, strategyData.usageCount,
        strategyData.successCount, strategyData.failureCount, strategyData.status,
        strategyData.tags, strategyData.metadata, strategyData.visibilityScope,
      ],
    );
  } else if (sqlite) {
    sqlite.prepare(`
      INSERT INTO strategies (id, project_id, user_id, agent_id, strategy_type, title, description, context, steps, success_criteria, failure_indicators, confidence, usage_count, success_count, failure_count, status, tags, metadata, visibility_scope, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, strategyData.projectId, strategyData.userId, strategyData.agentId,
      strategyData.strategyType, strategyData.title, strategyData.description,
      strategyData.context, strategyData.steps, strategyData.successCriteria,
      strategyData.failureIndicators, strategyData.confidence, strategyData.usageCount,
      strategyData.successCount, strategyData.failureCount, strategyData.status,
      strategyData.tags, strategyData.metadata, strategyData.visibilityScope,
      Math.floor(now / 1000), Math.floor(now / 1000),
    );
  }

  logger.info('Strategy created', { id, title: input.title, type: input.strategyType });

  return mapRowToStrategy({ ...strategyData, created_at: now, updated_at: now });
}

/**
 * Get a strategy by ID.
 */
export async function getStrategy(id: string): Promise<Strategy | null> {
  await ensureStrategyTables();
  const { raw } = await getDbClient();
  const sqlite = (raw as any).$client;
  const isPg = typeof (raw as any).query === 'function';

  if (isPg) {
    const result = await (raw as any).query(
      'SELECT * FROM strategies WHERE id = $1',
      [id],
    );
    return result.rows[0] ? mapRowToStrategy(result.rows[0]) : null;
  }

  if (sqlite) {
    const row = sqlite.prepare('SELECT * FROM strategies WHERE id = ?').get(id) as any;
    return row ? mapRowToStrategy(row) : null;
  }

  return null;
}

/**
 * List strategies with filters.
 */
export async function listStrategies(filters: {
  projectId?: string;
  strategyType?: StrategyType;
  status?: StrategyStatus;
  tags?: string[];
  limit?: number;
  offset?: number;
} = {}): Promise<Strategy[]> {
  await ensureStrategyTables();
  const { raw } = await getDbClient();
  const sqlite = (raw as any).$client;
  const isPg = typeof (raw as any).query === 'function';

  const limit = filters.limit ?? 100;
  const offset = filters.offset ?? 0;
  const conditions: string[] = [];
  const params: any[] = [];

  if (filters.projectId) {
    params.push(filters.projectId);
    conditions.push(isPg ? `project_id = $${params.length}` : 'project_id = ?');
  }
  if (filters.strategyType) {
    params.push(filters.strategyType);
    conditions.push(isPg ? `strategy_type = $${params.length}` : 'strategy_type = ?');
  }
  if (filters.status) {
    params.push(filters.status);
    conditions.push(isPg ? `status = $${params.length}` : 'status = ?');
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const sql = `
    SELECT * FROM strategies ${whereClause}
    ORDER BY confidence DESC, updated_at DESC
    LIMIT ${isPg ? `$${params.length + 1}` : '?'}
    OFFSET ${isPg ? `$${params.length + 2}` : '?'}
  `;
  params.push(limit, offset);

  if (isPg) {
    const result = await (raw as any).query(sql, params);
    let strategies = result.rows.map(mapRowToStrategy);
    if (filters.tags) {
      strategies = strategies.filter((s: Strategy) => {
        if (!s.tags) return false;
        const sTags: string[] = JSON.parse(s.tags);
        return filters.tags!.some((t) => sTags.includes(t));
      });
    }
    return strategies;
  }

  if (sqlite) {
    const rows = sqlite.prepare(sql).all(...params) as any[];
    let strategies = rows.map(mapRowToStrategy);
    if (filters.tags) {
      strategies = strategies.filter((s: Strategy) => {
        if (!s.tags) return false;
        const sTags: string[] = JSON.parse(s.tags);
        return filters.tags!.some((t) => sTags.includes(t));
      });
    }
    return strategies;
  }

  return [];
}

/**
 * Update fields on a strategy.
 */
export async function updateStrategy(id: string, updates: Partial<Strategy>): Promise<Strategy> {
  await ensureStrategyTables();
  const { raw } = await getDbClient();
  const sqlite = (raw as any).$client;
  const isPg = typeof (raw as any).query === 'function';

  const setClauses: string[] = [];
  const params: any[] = [];

  const fieldMap: Record<string, string> = {
    projectId: 'project_id',
    userId: 'user_id',
    agentId: 'agent_id',
    strategyType: 'strategy_type',
    title: 'title',
    description: 'description',
    context: 'context',
    steps: 'steps',
    successCriteria: 'success_criteria',
    failureIndicators: 'failure_indicators',
    confidence: 'confidence',
    usageCount: 'usage_count',
    successCount: 'success_count',
    failureCount: 'failure_count',
    lastUsedAt: 'last_used_at',
    lastSuccessAt: 'last_success_at',
    lastFailureAt: 'last_failure_at',
    status: 'status',
    supersededBy: 'superseded_by',
    tags: 'tags',
    metadata: 'metadata',
    visibilityScope: 'visibility_scope',
  };

  for (const [key, value] of Object.entries(updates)) {
    if (key === 'id' || key === 'createdAt' || key === 'updatedAt') continue;
    const col = fieldMap[key];
    if (!col) continue;
    params.push(value);
    setClauses.push(isPg ? `${col} = $${params.length}` : `${col} = ?`);
  }

  if (setClauses.length === 0) {
    const existing = await getStrategy(id);
    if (!existing) throw new Error(`Strategy not found: ${id}`);
    return existing;
  }

  // Always update updated_at
  setClauses.push(isPg ? 'updated_at = NOW()' : 'updated_at = ?');
  if (!isPg) params.push(Math.floor(Date.now() / 1000));

  params.push(id);
  const whereClause = isPg ? `id = $${params.length}` : 'id = ?';

  const sql = `UPDATE strategies SET ${setClauses.join(', ')} WHERE ${whereClause}`;

  if (isPg) {
    await (raw as any).query(sql, params);
  } else if (sqlite) {
    sqlite.prepare(sql).run(...params);
  }

  const updated = await getStrategy(id);
  if (!updated) throw new Error(`Strategy not found after update: ${id}`);
  return updated;
}

/**
 * Mark an old strategy as superseded by a new one, and create a supersedes edge.
 */
export async function supersedeStrategy(oldId: string, newId: string, reason?: string): Promise<void> {
  await updateStrategy(oldId, { status: 'superseded', supersededBy: newId });
  await createStrategyEdge(oldId, newId, 'supersedes', reason ? { reason } : undefined);
  logger.info('Strategy superseded', { oldId, newId, reason });
}

/**
 * Record a usage event for a strategy, incrementing counts and updating timestamps.
 */
export async function recordUsage(id: string, success: boolean): Promise<void> {
  await ensureStrategyTables();
  const { raw } = await getDbClient();
  const sqlite = (raw as any).$client;
  const isPg = typeof (raw as any).query === 'function';
  const now = Date.now();

  if (isPg) {
    if (success) {
      await (raw as any).query(
        `UPDATE strategies SET
          usage_count = usage_count + 1,
          success_count = success_count + 1,
          last_used_at = NOW(),
          last_success_at = NOW(),
          updated_at = NOW()
         WHERE id = $1`,
        [id],
      );
    } else {
      await (raw as any).query(
        `UPDATE strategies SET
          usage_count = usage_count + 1,
          failure_count = failure_count + 1,
          last_used_at = NOW(),
          last_failure_at = NOW(),
          updated_at = NOW()
         WHERE id = $1`,
        [id],
      );
    }
  } else if (sqlite) {
    if (success) {
      sqlite.prepare(`
        UPDATE strategies SET
          usage_count = usage_count + 1,
          success_count = success_count + 1,
          last_used_at = ?,
          last_success_at = ?,
          updated_at = ?
        WHERE id = ?
      `).run(Math.floor(now / 1000), Math.floor(now / 1000), Math.floor(now / 1000), id);
    } else {
      sqlite.prepare(`
        UPDATE strategies SET
          usage_count = usage_count + 1,
          failure_count = failure_count + 1,
          last_used_at = ?,
          last_failure_at = ?,
          updated_at = ?
        WHERE id = ?
      `).run(Math.floor(now / 1000), Math.floor(now / 1000), Math.floor(now / 1000), id);
    }
  }
}

/**
 * Soft-delete a strategy by setting status to 'deprecated'.
 */
export async function deleteStrategy(id: string): Promise<void> {
  await updateStrategy(id, { status: 'deprecated' });
  logger.info('Strategy deprecated', { id });
}

/**
 * Search strategies by text query across title, description, and context.
 * Uses LIKE for SQLite and ILIKE for PostgreSQL.
 */
export async function searchStrategies(query: string, projectId?: string): Promise<Strategy[]> {
  await ensureStrategyTables();
  const { raw } = await getDbClient();
  const sqlite = (raw as any).$client;
  const isPg = typeof (raw as any).query === 'function';

  const searchPattern = `%${query}%`;
  const likeOp = isPg ? 'ILIKE' : 'LIKE';
  const conditions: string[] = [
    `(title ${likeOp} ? OR description ${likeOp} ? OR context ${likeOp} ?)`,
  ];
  const params: any[] = [searchPattern, searchPattern, searchPattern];

  if (projectId) {
    params.push(projectId);
    conditions.push(isPg ? `project_id = $${params.length}` : 'project_id = ?');
  }

  const whereClause = conditions.join(' AND ');
  const sql = `
    SELECT * FROM strategies
    WHERE ${whereClause}
    ORDER BY confidence DESC
    LIMIT 50
  `;

  if (isPg) {
    const result = await (raw as any).query(sql, params);
    return result.rows.map(mapRowToStrategy);
  }

  if (sqlite) {
    const rows = sqlite.prepare(sql).all(...params) as any[];
    return rows.map(mapRowToStrategy);
  }

  return [];
}

/**
 * Get strategies above a minimum confidence threshold.
 */
export async function getStrategiesByConfidence(minConfidence: number, projectId?: string): Promise<Strategy[]> {
  await ensureStrategyTables();
  const { raw } = await getDbClient();
  const sqlite = (raw as any).$client;
  const isPg = typeof (raw as any).query === 'function';

  const conditions: string[] = ['confidence >= ?'];
  const params: any[] = [minConfidence];

  if (projectId) {
    params.push(projectId);
    conditions.push(isPg ? `project_id = $${params.length}` : 'project_id = ?');
  }

  const whereClause = conditions.join(' AND ');
  const sql = `
    SELECT * FROM strategies
    WHERE ${whereClause}
    ORDER BY confidence DESC
    LIMIT 100
  `;

  if (isPg) {
    const result = await (raw as any).query(sql, params);
    return result.rows.map(mapRowToStrategy);
  }

  if (sqlite) {
    const rows = sqlite.prepare(sql).all(...params) as any[];
    return rows.map(mapRowToStrategy);
  }

  return [];
}

/**
 * Create an edge between two strategies.
 */
export async function createStrategyEdge(
  fromId: string,
  toId: string,
  edgeType: StrategyEdgeType,
  metadata?: Record<string, unknown>,
): Promise<void> {
  await ensureStrategyTables();
  const { raw } = await getDbClient();
  const sqlite = (raw as any).$client;
  const isPg = typeof (raw as any).query === 'function';

  const id = randomUUID();
  const metadataJson = metadata ? JSON.stringify(metadata) : null;

  if (isPg) {
    await (raw as any).query(
      `INSERT INTO strategy_edges (id, from_strategy_id, to_strategy_id, edge_type, metadata, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [id, fromId, toId, edgeType, metadataJson],
    );
  } else if (sqlite) {
    sqlite.prepare(`
      INSERT INTO strategy_edges (id, from_strategy_id, to_strategy_id, edge_type, metadata, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, fromId, toId, edgeType, metadataJson, Math.floor(Date.now() / 1000));
  }
}

/**
 * Create an edge linking a strategy to a belief.
 */
export async function createStrategyBeliefEdge(
  strategyId: string,
  beliefId: string,
  edgeType: StrategyBeliefEdgeType,
): Promise<void> {
  await ensureStrategyTables();
  const { raw } = await getDbClient();
  const sqlite = (raw as any).$client;
  const isPg = typeof (raw as any).query === 'function';

  const id = randomUUID();

  if (isPg) {
    await (raw as any).query(
      `INSERT INTO strategy_belief_edges (id, strategy_id, belief_id, edge_type, created_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [id, strategyId, beliefId, edgeType],
    );
  } else if (sqlite) {
    sqlite.prepare(`
      INSERT INTO strategy_belief_edges (id, strategy_id, belief_id, edge_type, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, strategyId, beliefId, edgeType, Math.floor(Date.now() / 1000));
  }
}

/**
 * Get aggregate statistics for strategies.
 */
export async function getStrategyStats(projectId?: string): Promise<{
  total: number;
  byType: Record<string, number>;
  byStatus: Record<string, number>;
  avgConfidence: number;
  totalUsage: number;
}> {
  await ensureStrategyTables();
  const { raw } = await getDbClient();
  const sqlite = (raw as any).$client;
  const isPg = typeof (raw as any).query === 'function';

  const whereClause = projectId ? (isPg ? 'WHERE project_id = $1' : 'WHERE project_id = ?') : '';
  const params = projectId ? [projectId] : [];

  const sql = `SELECT * FROM strategies ${whereClause}`;

  if (isPg) {
    const result = await (raw as any).query(sql, params);
    const rows = result.rows;
    return computeStats(rows);
  }

  if (sqlite) {
    const rows = sqlite.prepare(sql).all(...params) as any[];
    return computeStats(rows);
  }

  return { total: 0, byType: {}, byStatus: {}, avgConfidence: 0, totalUsage: 0 };
}

function computeStats(rows: any[]): {
  total: number;
  byType: Record<string, number>;
  byStatus: Record<string, number>;
  avgConfidence: number;
  totalUsage: number;
} {
  const total = rows.length;
  const byType: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  let totalConfidence = 0;
  let totalUsage = 0;

  for (const row of rows) {
    const t = row.strategy_type ?? 'unknown';
    byType[t] = (byType[t] ?? 0) + 1;
    const s = row.status ?? 'unknown';
    byStatus[s] = (byStatus[s] ?? 0) + 1;
    totalConfidence += Number(row.confidence ?? 0.5);
    totalUsage += Number(row.usage_count ?? 0);
  }

  return {
    total,
    byType,
    byStatus,
    avgConfidence: total > 0 ? totalConfidence / total : 0,
    totalUsage,
  };
}
