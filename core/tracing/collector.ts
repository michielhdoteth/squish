/** Trace Collector - Collects search pipeline traces for debugging and performance analysis
 *
 * Trace storage format - All search operations are logged with timing information
 * Trace retrieval - Get traces by session or ID
 */

import { logger } from '../logger.js';
import { getDb } from '../../db/index.js';
import { getSchema } from '../../db/schema.js';
import { eq, desc, sql } from 'drizzle-orm';

export interface SearchTrace {
  id: string;  // UUID of this trace
  sessionId: string | null;  // Session that originated this trace
  query: string;
  timestamp: Date;  // When trace started
  totalDurationMs: number;  // Total trace duration in milliseconds
  metadata: Record<string, unknown>;  // Additional metadata about the trace
  // Stage data (stored as JSONB in schema)
  queryRewrite?: QueryRewriteStage;
  candidateRetrieval?: RetrievalStage;
  entityFiltering?: RetrievalStage;
  hybridScoring?: ScoringStage;
  reranking?: RerankingStage;
  resultCount?: number;
  topResults?: TopResult[];
}

export interface QueryRewriteStage {
  original?: string;
  rewritten?: string;
  method?: string;
  timeMs?: number;
}

export interface RetrievalStage {
  candidates?: number;
  results?: number;
  timeMs?: number;
  entities?: string[];
}

export interface ScoringStage {
  results?: number;
  timeMs?: number;
}

export interface RerankingStage {
  results?: number;
  timeMs?: number;
}

export interface TopResult {
  type?: string;
  content?: string;
  hybridScore?: number;
}

export interface TraceOptions {
  sessionId?: string;
  limit?: number;  // Limit traces to retrieve
  session?: string;  // Filter by session ID
}

export interface TraceStats {
  totalTraces: number;
  totalDurationMs: number;
  avgDurationMs: number;
  recentSessions: number;
  totalErrors: number;
  errorRate: number;
}

/**
 * Start a new search trace collection
 */
export async function startTrace(sessionId: string, query: string): Promise<string> {
  const db = await getDb();
  if (!db) {
    logger.error('Database unavailable for trace collection');
    return '';
  }

  const schema = await getSchema();
  const sqliteDb = db as any;

  const traceId = crypto.randomUUID();
  const timestamp = new Date();

  // Create trace record
  await sqliteDb.insert(schema.searchTraces).values({
    id: traceId,
    sessionId,
    query,
    timestamp,
    resultCount: 0,
    totalDurationMs: 0,
  });

  logger.info(`[Tracing] Started trace ${traceId}`);

  return traceId;
}

/**
 * Add query rewrite stage data
 */
export async function addQueryRewriteStage(traceId: string, stage: QueryRewriteStage): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const schema = await getSchema();
  const sqliteDb = db as any;
  const data = JSON.stringify(stage);

  await sqliteDb.update(schema.searchTraces)
    .set({
      queryRewrite: sql`CAST(? AS jsonb)`,
    })
    .where(eq(schema.searchTraces.id, traceId))
    .set({ queryRewrite: data });

  logger.debug(`[Tracing] Added queryRewrite stage to trace ${traceId}`);
}

/**
 * Add candidate retrieval stage data
 */
export async function addCandidateRetrievalStage(traceId: string, stage: RetrievalStage): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const schema = await getSchema();
  const sqliteDb = db as any;
  const data = JSON.stringify(stage);

  await sqliteDb.update(schema.searchTraces)
    .set({ candidateRetrieval: data })
    .where(eq(schema.searchTraces.id, traceId));

  logger.debug(`[Tracing] Added candidateRetrieval stage to trace ${traceId}`);
}

/**
 * Add entity filtering stage data
 */
export async function addEntityFilteringStage(traceId: string, stage: RetrievalStage): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const schema = await getSchema();
  const sqliteDb = db as any;
  const data = JSON.stringify(stage);

  await sqliteDb.update(schema.searchTraces)
    .set({ entityFiltering: data })
    .where(eq(schema.searchTraces.id, traceId));

  logger.debug(`[Tracing] Added entityFiltering stage to trace ${traceId}`);
}

/**
 * Add hybrid scoring stage data
 */
export async function addHybridScoringStage(traceId: string, stage: ScoringStage): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const schema = await getSchema();
  const sqliteDb = db as any;
  const data = JSON.stringify(stage);

  await sqliteDb.update(schema.searchTraces)
    .set({ hybridScoring: data })
    .where(eq(schema.searchTraces.id, traceId));

  logger.debug(`[Tracing] Added hybridScoring stage to trace ${traceId}`);
}

/**
 * Add reranking stage data
 */
export async function addRerankingStage(traceId: string, stage: RerankingStage): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const schema = await getSchema();
  const sqliteDb = db as any;
  const data = JSON.stringify(stage);

  await sqliteDb.update(schema.searchTraces)
    .set({ reranking: data })
    .where(eq(schema.searchTraces.id, traceId));

  logger.debug(`[Tracing] Added reranking stage to trace ${traceId}`);
}

/**
 * Complete current trace (all stages done)
 */
export async function completeTrace(traceId: string, results: TopResult[]): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const schema = await getSchema();
  const sqliteDb = db as any;

  // Get trace
  const rows = await sqliteDb.select()
    .from(schema.searchTraces)
    .where(eq(schema.searchTraces.id, traceId))
    .limit(1);

  if (!rows || rows.length === 0) {
    logger.warn(`[Tracing] Trace ${traceId} not found`);
    return;
  }

  const trace = rows[0];
  const startTime = trace.timestamp.getTime();
  const endTime = Date.now();
  const totalDurationMs = endTime - startTime;

  const resultCount = results.length;
  const topResults = results.slice(0, 10);

  await sqliteDb.update(schema.searchTraces)
    .set({
      resultCount,
      topResults: JSON.stringify(topResults),
      totalDurationMs,
    })
    .where(eq(schema.searchTraces.id, traceId));

  logger.info(`[Tracing] Completed trace ${traceId} with ${resultCount} results`);
}

/**
 * Get traces for a session
 */
export async function getTraces(options: TraceOptions = {}): Promise<SearchTrace[]> {
  const db = await getDb();
  if (!db) return [];

  const schema = await getSchema();
  const sqliteDb = db as any;

  let conditions = [];

  if (options.sessionId) {
    conditions.push(eq(schema.searchTraces.sessionId, options.sessionId));
  }

  if (options.session && options.session.length > 0) {
    conditions.push(eq(schema.searchTraces.sessionId, options.session));
  }

  const query = sqliteDb.select()
    .from(schema.searchTraces)
    .where(conditions.length > 0 ? eq(schema.searchTraces.sessionId, options.sessionId || options.session || '') : undefined)
    .orderBy(desc(schema.searchTraces.timestamp));

  if (options.limit) {
    query.limit(options.limit);
  }

  const traces = await query;

  return traces.map((row: any): SearchTrace => ({
    id: row.id,
    sessionId: row.session_id,
    query: row.query,
    timestamp: row.timestamp,
    totalDurationMs: row.total_duration_ms,
    metadata: row.metadata ? JSON.parse(String(row.metadata)) : {},
    queryRewrite: row.query_rewrite ? JSON.parse(String(row.query_rewrite)) : undefined,
    candidateRetrieval: row.candidate_retrieval ? JSON.parse(String(row.candidate_retrieval)) : undefined,
    entityFiltering: row.entity_filtering ? JSON.parse(String(row.entity_filtering)) : undefined,
    hybridScoring: row.hybrid_scoring ? JSON.parse(String(row.hybrid_scoring)) : undefined,
    reranking: row.reranking ? JSON.parse(String(row.reranking)) : undefined,
    resultCount: row.result_count,
    topResults: row.top_results ? JSON.parse(String(row.top_results)) : undefined,
  }));
}

/**
 * Get a specific trace by ID
 */
export async function getTraceById(traceId: string): Promise<SearchTrace | null> {
  const db = await getDb();
  if (!db) return null;

  const schema = await getSchema();
  const sqliteDb = db as any;

  const rows = await sqliteDb.select()
    .from(schema.searchTraces)
    .where(eq(schema.searchTraces.id, traceId))
    .limit(1);

  if (rows.length === 0) return null;

  const row = rows[0];

  return {
    id: row.id,
    sessionId: row.session_id,
    query: row.query,
    timestamp: row.timestamp,
    totalDurationMs: row.total_duration_ms,
    metadata: row.metadata ? JSON.parse(String(row.metadata)) : {},
    queryRewrite: row.query_rewrite ? JSON.parse(String(row.query_rewrite)) : undefined,
    candidateRetrieval: row.candidate_retrieval ? JSON.parse(String(row.candidate_retrieval)) : undefined,
    entityFiltering: row.entity_filtering ? JSON.parse(String(row.entity_filtering)) : undefined,
    hybridScoring: row.hybrid_scoring ? JSON.parse(String(row.hybrid_scoring)) : undefined,
    reranking: row.reranking ? JSON.parse(String(row.reranking)) : undefined,
    resultCount: row.result_count,
    topResults: row.top_results ? JSON.parse(String(row.top_results)) : undefined,
  };
}

/**
 * Get recent traces (limited)
 */
export async function getRecentTraces(limit: number = 10): Promise<SearchTrace[]> {
  const db = await getDb();
  if (!db) return [];

  const schema = await getSchema();
  const sqliteDb = db as any;

  const traces = await sqliteDb.select()
    .from(schema.searchTraces)
    .orderBy(desc(schema.searchTraces.timestamp))
    .limit(limit);

  return traces.map((row: any): SearchTrace => ({
    id: row.id,
    sessionId: row.session_id,
    query: row.query,
    timestamp: row.timestamp,
    totalDurationMs: row.total_duration_ms,
    metadata: row.metadata ? JSON.parse(String(row.metadata)) : {},
    queryRewrite: row.query_rewrite ? JSON.parse(String(row.query_rewrite)) : undefined,
    candidateRetrieval: row.candidate_retrieval ? JSON.parse(String(row.candidate_retrieval)) : undefined,
    entityFiltering: row.entity_filtering ? JSON.parse(String(row.entity_filtering)) : undefined,
    hybridScoring: row.hybrid_scoring ? JSON.parse(String(row.hybrid_scoring)) : undefined,
    reranking: row.reranking ? JSON.parse(String(row.reranking)) : undefined,
    resultCount: row.result_count,
    topResults: row.top_results ? JSON.parse(String(row.top_results)) : undefined,
  }));
}

/**
 * Get recent session summary traces (aggregated by session)
 */
export async function getSessionTraces(sessionId: string): Promise<SearchTrace[]> {
  const db = await getDb();
  if (!db) return [];

  const schema = await getSchema();
  const sqliteDb = db as any;

  // Get all traces for this session
  const traces = await sqliteDb.select()
    .from(schema.searchTraces)
    .where(eq(schema.searchTraces.sessionId, sessionId))
    .orderBy(desc(schema.searchTraces.timestamp));

  if (traces.length === 0) return [];

  return traces.map((row: any): SearchTrace => ({
    id: row.id,
    sessionId: row.session_id,
    query: row.query,
    timestamp: row.timestamp,
    totalDurationMs: row.total_duration_ms,
    metadata: row.metadata ? JSON.parse(String(row.metadata)) : {},
    queryRewrite: row.query_rewrite ? JSON.parse(String(row.query_rewrite)) : undefined,
    candidateRetrieval: row.candidate_retrieval ? JSON.parse(String(row.candidate_retrieval)) : undefined,
    entityFiltering: row.entity_filtering ? JSON.parse(String(row.entity_filtering)) : undefined,
    hybridScoring: row.hybrid_scoring ? JSON.parse(String(row.hybrid_scoring)) : undefined,
    reranking: row.reranking ? JSON.parse(String(row.reranking)) : undefined,
    resultCount: row.result_count,
    topResults: row.top_results ? JSON.parse(String(row.top_results)) : undefined,
  }));
}

/**
 * Create visual ASCII visualization of a trace
 */
export function visualizeTrace(trace: SearchTrace): string {
  const lines: string[] = [];

  // Header
  lines.push(`Search Trace: ${trace.id}`);
  lines.push(`Session: ${trace.sessionId || 'N/A'}`);
  lines.push(`Query: "${trace.query}"`);
  lines.push('');

  // Total duration
  lines.push(`Duration: ${trace.totalDurationMs}ms (${(trace.totalDurationMs / 1000).toFixed(2)}s)`);
  lines.push('');

  // Stages summary
  const stageNames: string[] = [];
  if (trace.queryRewrite) stageNames.push(`Query Rewrite (${trace.queryRewrite.timeMs || 0}ms)`);
  if (trace.candidateRetrieval) stageNames.push(`Candidate Retrieval (${trace.candidateRetrieval.timeMs || 0}ms)`);
  if (trace.entityFiltering) stageNames.push(`Entity Filtering (${trace.entityFiltering.timeMs || 0}ms)`);
  if (trace.hybridScoring) stageNames.push(`Hybrid Scoring (${trace.hybridScoring.timeMs || 0}ms)`);
  if (trace.reranking) stageNames.push(`Reranking (${trace.reranking.timeMs || 0}ms)`);

  if (stageNames.length > 0) {
    lines.push('Stages:');
    stageNames.forEach(name => lines.push(`  - ${name}`));
  }

  lines.push('');

  // Top results
  if (trace.topResults && trace.topResults.length > 0) {
    lines.push(`Top Results (${trace.topResults.length}):`);

    trace.topResults.slice(0, 5).forEach((result, i) =>
      lines.push(`  ${i + 1}. [${result.type || 'memory'}] ${result.content?.substring(0, 50)}... (score: ${result.hybridScore?.toFixed(2)})`)
    );
  }

  return lines.join('\n');
}

/**
 * Get trace statistics (performance metrics)
 */
export async function getTraceStats(): Promise<TraceStats> {
  const db = await getDb();
  if (!db) {
    return {
      totalTraces: 0,
      totalDurationMs: 0,
      avgDurationMs: 0,
      recentSessions: 0,
      totalErrors: 0,
      errorRate: 0,
    };
  }

  const schema = await getSchema();
  const sqliteDb = db as any;

  const traces = await sqliteDb.select()
    .from(schema.searchTraces)
    .limit(100);

  const totalTraces = traces.length;
  const totalDurationMs = traces.reduce((sum: number, t: any) => sum + (t.total_duration_ms || 0), 0);
  const avgDurationMs = totalTraces > 0 ? Math.round(totalDurationMs / totalTraces) : 0;

  const uniqueSessions = new Set(traces.map((t: any) => t.session_id).filter(Boolean));
  const recentSessions = uniqueSessions.size;

  return {
    totalTraces,
    totalDurationMs,
    avgDurationMs,
    recentSessions,
    totalErrors: 0,
    errorRate: 0,
  };
}
