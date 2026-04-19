/**
 * Agent Hooks - Core Logic
 * 
 * Universal hooks for auto-capturing agent activities.
 * Works with Claude Code, OpenCode, Cursor, Windsurf.
 * 
 * Hook events:
 * - sessionStart: Inject relevant memories on session start
 * - postToolUse: Record observations after tool execution
 * - sessionEnd: Save snapshot and sync learnings
 * - preCompact: Save state before context compaction
 */

import { randomUUID } from 'crypto';
import { createLearning, type LearningInput } from '../ingestion/learnings.js';
import { getRecent, search, rememberMemory } from '../memory/memories.js';
import { config } from '../../config.js';
import { logger } from '../logger.js';
import { shouldCaptureTool, categorizeTool } from './capture-filter.js';
import { inferTags } from './auto-tagger.js';
import { ensureProject, getProjectByPath } from '../projects.js';
import { autoAssignMemory, initializeDefaultPlaces } from '../places/index.js';
import { compressForContext } from '../compression.js';
import { getAgentPreferences } from '../agent-preferences.js';
import { classifySignalEvent, distillSignalEvent } from '../ingestion/signal-engine.js';
import { compactSessionWorkingSet, recordSessionSignal } from '../session/working-set.js';
import { getDbClient } from '../lib/db-client.js';
import { eq } from 'drizzle-orm';
import { serializeMetadata, deserializeMetadata } from '../memory/serialization.js';
import { addMemoryToGraph } from '../graph/graph-builder.js';
import { addToHotCache, addSessionContextToHotCache } from '../hot-cache.js';
import { extractBeliefsFromMemory } from '../beliefs/extractor.js';
import { upsertBeliefsForMemory } from '../beliefs/store.js';

/** Session ID for tracking across agents */
let currentSessionId: string | null = null;

/**
 * Generate a new session ID (universal across agents)
 */
export function generateSessionId(): string {
  currentSessionId = randomUUID();
  return currentSessionId;
}

/**
 * Get current session ID
 */
export function getCurrentSessionId(): string | null {
  return currentSessionId;
}

/**
 * Set session ID (for resume/continue)
 */
export function setSessionId(sessionId: string): void {
  currentSessionId = sessionId;
}

/**
 * Session start hook - inject relevant context
 */
export async function handleSessionStart(params: {
  projectPath: string;
  mode: 'startup' | 'resume' | 'compact';
  agentType: 'claude-code' | 'opencode' | 'cursor' | 'windsurf';
}): Promise<{
  memories: string[];
  sessionId: string;
  count: number;
  preferences?: Array<{key: string; value: string}>;
}> {
  const { projectPath, mode, agentType } = params;
  
  // Ensure project exists
  await ensureProject(projectPath);
  
  // Generate or get session ID
  if (!currentSessionId) {
    currentSessionId = generateSessionId();
  }
  
  logger.info(`[Hooks] Session start: ${mode} (agent: ${agentType}, session: ${currentSessionId})`);
  
  // Get recent memories based on mode
  const limit = mode === 'compact' ? 3 : 5;
  const memories = await getRecent(projectPath, limit);
  const compactedWorkingSet = await compactSessionWorkingSet(currentSessionId, projectPath);
  
  // Get spatial memory context (places) for context injection
  let placesContext = '';
  try {
    const { initializeDefaultPlaces, getProjectPlaces } = await import('../places/index.js');
    const { getProjectByPath } = await import('../projects.js');
    const project = await getProjectByPath(projectPath);
    if (project) {
      await initializeDefaultPlaces(project.id);
      const places = await getProjectPlaces(project.id);
      if (places.length > 0) {
        const populatedPlaces = places.filter(p => p.memoryCount > 0).slice(0, 3);
        if (populatedPlaces.length > 0) {
          placesContext = '\n\nActive places: ' + populatedPlaces.map(p => `${p.name} (${p.memoryCount})`).join(', ');
        }
      }
    }
  } catch (e) {
    // Don't fail if places not available
    logger.debug(`[Hooks] Places context not available: ${e}`);
  }
  
  // Format for injection with compression
  const formatted = memories.map((m, i) => {
    const compressed = compressForContext(m.content || '');
    return `${i + 1}. [${m.type}] ${compressed}`;
  }).join('\n');
  
  const workingSetContext = compactedWorkingSet.summary ? `Session working set:\n${compactedWorkingSet.summary}\n\n` : '';
  const allContent = workingSetContext + formatted + placesContext;
  
  // Get agent preferences for context injection
  let preferences: Array<{key: string; value: string}> = [];
  try {
    const project = await getProjectByPath(projectPath);
    if (project) {
      preferences = await getAgentPreferences(project.id);
    }
  } catch (e) {
    logger.debug(`[Hooks] Agent preferences not available: ${e}`);
  }
  
  logger.info(`[Hooks] Injected ${memories.length} memories for session start`);
  
  return {
    memories: allContent ? allContent.split('\n') : [],
    sessionId: currentSessionId,
    count: memories.length,
    preferences: preferences.length > 0 ? preferences : undefined,
  };
}

/**
 * Post-tool-use hook - record observations
 */
export async function handlePostToolUse(params: {
  toolName: string;
  toolInput: Record<string, unknown>;
  toolResult: unknown;
  projectPath: string;
  agentType: 'claude-code' | 'opencode' | 'cursor' | 'windsurf';
}): Promise<{
  captured: boolean;
  memoryId?: string;
  reason?: string;
}> {
  const { toolName, toolInput, toolResult, projectPath, agentType } = params;
  
  // Ensure project exists
  await ensureProject(projectPath);
  
  // Ensure session ID exists
  if (!currentSessionId) {
    currentSessionId = generateSessionId();
  }
  
  // Check if we should capture this tool
  if (!shouldCaptureTool(toolName)) {
    await recordSessionSignal({
      sessionId: currentSessionId,
      projectPath,
      classification: 'discard',
      distilledContent: `Filtered tool: ${toolName}`,
      toolName,
      target: extractTarget(toolName, toolInput),
    });
    return { captured: false, reason: `Tool ${toolName} filtered out` };
  }
  
  // Extract relevant information
  const category = categorizeTool(toolName);
  const target = extractTarget(toolName, toolInput);
  const content = extractContent(toolName, toolInput, toolResult);
  const signalDecision = classifySignalEvent({
    toolName,
    toolInput,
    toolResult,
    sessionId: currentSessionId,
  });
  const distilledContent = distillSignalEvent({
    toolName,
    command: String(toolInput.command || toolInput.cmd || ''),
    content: signalDecision.content || content,
    classification: signalDecision.classification,
  });
  
  // Infer tags from context
  const tags = inferTags(toolName, toolInput, distilledContent || content);

  await recordSessionSignal({
    sessionId: currentSessionId,
    projectPath,
    classification: signalDecision.classification,
    distilledContent,
    toolName,
    target,
    metadata: {
      activeFiles: extractActiveFiles(toolName, toolInput),
      command: String(toolInput.command || toolInput.cmd || ''),
      outcome: inferOutcome(signalDecision, toolResult),
      contentHash: signalDecision.contentHash,
      tokensSaved: signalDecision.estimatedSavings,
      activePlaces: signalDecision.placeHint.placeType ? [signalDecision.placeHint.placeType] : [],
      graphEntities: signalDecision.graphHint.entityTerms,
      placeRouted: Boolean(signalDecision.placeHint.placeType),
      graphEnriched: signalDecision.graphHint.shouldEnrich,
    },
  });

  if (signalDecision.classification === 'discard') {
    return { captured: false, reason: signalDecision.reasons.join(', ') };
  }

  if (signalDecision.classification === 'session-only') {
    return { captured: false, reason: 'Stored in session working set only' };
  }
  
  try {
    const memory = await rememberMemory({
      content: `[${category}] ${distilledContent || content}`,
      project: projectPath,
      type: category === 'modification' ? 'decision' : category === 'planning' ? 'context' : 'observation',
      source: 'auto-capture',
      metadata: {
        signal: {
          classification: signalDecision.classification,
          reasons: signalDecision.reasons,
          nuanceSuppressed: signalDecision.classification === 'durable-raw+distilled',
          wakeUpPriority: signalDecision.wakeUpPriority,
        },
        placeHint: signalDecision.placeHint,
        graphHint: signalDecision.graphHint,
        target,
        toolName,
      },
    });
    
    logger.info(`[Hooks] Captured ${toolName} → ${memory.id} (session: ${currentSessionId})`);
    
    let placeAssignment: { assigned: boolean; placeId?: string; placeType?: string } | undefined;
    try {
      const project = await getProjectByPath(projectPath);
      if (project) {
        await initializeDefaultPlaces(project.id);
        placeAssignment = await autoAssignMemory({
          memoryId: memory.id,
          projectId: project.id,
          toolName,
          content: memory.content,
          tags,
          memoryType: memory.type,
        });
      }
    } catch (placeError) {
      logger.warn(`[Hooks] Place assignment failed: ${placeError}`);
    }

    let graphStatus: {
      enriched: boolean;
      entitiesCreated: number;
      relationsCreated: number;
      source: string;
      entityTerms: string[];
    } = {
      enriched: false,
      entitiesCreated: 0,
      relationsCreated: 0,
      source: 'none',
      entityTerms: signalDecision.graphHint.entityTerms,
    };

    if (signalDecision.graphHint.shouldEnrich) {
      try {
        const graphResult = await addMemoryToGraph(memory.id, { preferLLM: true });
        graphStatus = {
          enriched: graphResult.entitiesCreated > 0 || graphResult.relationsCreated > 0,
          entitiesCreated: graphResult.entitiesCreated,
          relationsCreated: graphResult.relationsCreated,
          source: graphResult.source,
          entityTerms: signalDecision.graphHint.entityTerms,
        };
      } catch (graphError) {
        logger.warn(`[Hooks] Graph enrichment failed: ${graphError}`);
      }
    }

    let rawFallbackSnapshotId: string | undefined;
    if (signalDecision.classification === 'durable-raw+distilled') {
      rawFallbackSnapshotId = await attachRawFallbackSnapshot(memory.id, signalDecision.content, signalDecision.reasons);
    }

    await attachInspectionMetadata(memory.id, {
      classification: signalDecision.classification,
      reasons: signalDecision.reasons,
      rawFallbackSnapshotId,
      nuanceSuppressed: signalDecision.classification === 'durable-raw+distilled',
      placeId: placeAssignment?.placeId,
      placeType: placeAssignment?.placeType,
      graph: graphStatus,
    });

    try {
      const project = await getProjectByPath(projectPath);
      if (project) {
        const beliefs = extractBeliefsFromMemory({
          memoryId: memory.id,
          content: memory.content,
          type: memory.type,
          metadata: memory.metadata ?? null,
        });
        if (beliefs.length > 0) {
          const storedBeliefs = await upsertBeliefsForMemory({
            projectId: project.id,
            memoryId: memory.id,
            beliefs,
          });
          await attachBeliefInspectionMetadata(memory.id, storedBeliefs);
        }
      }
    } catch (beliefError) {
      logger.warn(`[Hooks] Belief extraction failed: ${beliefError}`);
    }
    
    return {
      captured: true,
      memoryId: memory.id,
    };
  } catch (error) {
    logger.error(`[Hooks] Failed to capture:`, error);
    return { captured: false, reason: 'Failed to create learning' };
  }
}

async function attachRawFallbackSnapshot(memoryId: string, rawContent: string, reasons: string[]): Promise<string> {
  const { db, schema } = await getDbClient();
  const snapshotId = randomUUID();
  await db.insert(schema.memorySnapshots).values({
    id: snapshotId,
    memoryId,
    snapshotType: 'periodic',
    content: rawContent,
    metadata: serializeMetadata({
      role: 'raw-fallback',
      reasons,
      createdBy: 'signal-engine',
    }),
    createdAt: new Date(),
  });
  return snapshotId;
}

async function attachInspectionMetadata(memoryId: string, signal: {
  classification: string;
  reasons: string[];
  rawFallbackSnapshotId?: string;
  nuanceSuppressed: boolean;
  placeId?: string;
  placeType?: string;
  graph?: {
    enriched: boolean;
    entitiesCreated: number;
    relationsCreated: number;
    source: string;
    entityTerms: string[];
  };
}) {
  const { db, schema } = await getDbClient();
  const rows = await db.select().from(schema.memories).where(eq(schema.memories.id, memoryId)).limit(1);
  const row = rows[0];
  if (!row) return;
  const details = deserializeMetadata(row.metadata ?? null) ?? {};
  const next = {
    ...details,
    signal,
    classification: signal.classification,
    reasons: signal.reasons,
    rawFallbackSnapshotId: signal.rawFallbackSnapshotId,
    nuanceSuppressed: signal.nuanceSuppressed,
    placeId: signal.placeId,
    placeType: signal.placeType,
    graph: signal.graph,
    graphStatus: signal.graph
      ? `${signal.graph.enriched ? 'enriched' : 'skipped'} (${signal.graph.entitiesCreated} entities, ${signal.graph.relationsCreated} relations)`
      : 'none',
  };
  await db.update(schema.memories)
    .set({ metadata: serializeMetadata(next), updatedAt: new Date() })
    .where(eq(schema.memories.id, memoryId));
}

async function attachBeliefInspectionMetadata(memoryId: string, beliefs: Array<{
  id: string;
  type: string;
  statement: string;
  status: string;
  confidence: number;
  sourceMemoryIds: string[];
  reason?: string;
}>) {
  const { db, schema } = await getDbClient();
  const rows = await db.select().from(schema.memories).where(eq(schema.memories.id, memoryId)).limit(1);
  const row = rows[0];
  if (!row) return;
  const details = deserializeMetadata(row.metadata ?? null) ?? {};
  const next = {
    ...details,
    beliefs: beliefs.map((belief) => ({
      id: belief.id,
      type: belief.type,
      statement: belief.statement,
      status: belief.status,
      confidence: belief.confidence,
      sourceMemoryIds: belief.sourceMemoryIds,
      reason: belief.reason,
    })),
  };
  await db.update(schema.memories)
    .set({ metadata: serializeMetadata(next), updatedAt: new Date() })
    .where(eq(schema.memories.id, memoryId));
}

function extractActiveFiles(toolName: string, toolInput: Record<string, unknown>): string[] {
  const path = String(toolInput.filePath || toolInput.path || '');
  if (['Write', 'Edit', 'MultiEdit'].includes(toolName) && path) {
    return [path];
  }
  return [];
}

function inferOutcome(signalDecision: { classification: string }, toolResult: unknown): string | undefined {
  const content = typeof toolResult === 'string' ? toolResult.toLowerCase() : String(toolResult ?? '').toLowerCase();
  if (signalDecision.classification === 'discard') return 'suppressed';
  if (/\bfail|error|exception|traceback\b/.test(content)) return 'failure';
  if (/\bpass|success|completed\b/.test(content)) return 'success';
  return undefined;
}

/**
 * Session end hook - save snapshot and sync to persistent hot cache
 */
export async function handleSessionEnd(params: {
  projectPath: string;
  agentType: 'claude-code' | 'opencode' | 'cursor' | 'windsurf';
  workInProgress?: string;
}): Promise<{
  snapshotId?: string;
  memoriesSaved: number;
}> {
  const { projectPath, agentType, workInProgress } = params;
  
  // Ensure project exists
  await ensureProject(projectPath);
  
  logger.info(`[Hooks] Session end (agent: ${agentType}, session: ${currentSessionId})`);
  
  // Save session snapshot as a learning
  if (workInProgress) {
    const snapshot = await createLearning({
      type: 'insight',
      content: `[SESSION SNAPSHOT] ${workInProgress}`,
      action: 'session-end',
      project: projectPath,
      autoLink: false,
    });
    
    logger.info(`[Hooks] Saved session snapshot: ${snapshot.id}`);
    
    // NEW: Also save to persistent hot cache (survives restart)
    try {
      const workingSet = await compactSessionWorkingSet(projectPath);
      await addSessionContextToHotCache({
        activeFiles: workingSet?.activeFiles || [],
        commands: workingSet?.recentCommands?.slice(-3).map(c => c.command) || [],
        failures: workingSet?.recentFailures?.slice(-2) || [],
        decisions: [],  // Could extract from recent signals
        hypotheses: workingSet?.currentHypotheses?.slice(-2) || [],
      }, projectPath);
      logger.info('[Hooks] Saved session context to hot cache');
    } catch (error) {
      logger.warn('[Hooks] Failed to save hot cache', error);
    }
    
    currentSessionId = null; // Clear session
    
    return {
      snapshotId: snapshot.id,
      memoriesSaved: 1,
    };
  }
  
  currentSessionId = null;
  
  return {
    memoriesSaved: 0,
  };
}

/**
 * Pre-compact hook - save state for recovery
 */
export async function handlePreCompact(params: {
  projectPath: string;
  agentType: 'claude-code' | 'opencode' | 'cursor' | 'windsurf';
}): Promise<{
  stateSaved: boolean;
  stateId?: string;
}> {
  const { projectPath, agentType } = params;
  
  // Ensure project exists
  await ensureProject(projectPath);
  
  logger.info(`[Hooks] Pre-compact (agent: ${agentType})`);
  
  // Get recent work for recovery
  const recent = await getRecent(projectPath, 3);
  
  // Save state
  const state = await createLearning({
    type: 'insight',
    content: `[PRE-COMPACT] State saved for recovery. Recent: ${recent.map(r => r.content?.substring(0, 50)).join(' | ')}`,
    action: 'pre-compact',
    project: projectPath,
    autoLink: false,
  });
  
  return {
    stateSaved: true,
    stateId: state.id,
  };
}

/**
 * Extract target from tool input
 */
function extractTarget(toolName: string, toolInput: Record<string, unknown>): string {
  switch (toolName) {
    case 'Write':
    case 'Edit':
      return String(toolInput.filePath || toolInput.path || 'unknown');
    case 'Bash':
      return String(toolInput.command || toolInput.cmd || 'unknown');
    case 'Task':
      return String(toolInput.description || toolInput.name || 'unknown');
    default:
      return 'unknown';
  }
}

/**
 * Extract content summary from tool result
 */
function extractContent(
  toolName: string, 
  toolInput: Record<string, unknown>, 
  toolResult: unknown
): string {
  switch (toolName) {
    case 'Write':
      return `Wrote: ${toolInput.filePath || toolInput.path}`;
    case 'Edit':
      return `Edited: ${toolInput.filePath || toolInput.path}`;
    case 'Bash':
      const cmd = String(toolInput.command || toolInput.cmd || '');
      if (cmd.includes('commit')) return `Git commit executed`;
      if (cmd.includes('test')) return `Tests run`;
      return `Command: ${cmd.substring(0, 50)}`;
    case 'Task':
      return `Task: ${toolInput.description || toolInput.name || 'unknown'}`;
    default:
      return `Used: ${toolName}`;
  }
}

// Re-export for convenience
export { shouldCaptureTool, categorizeTool } from './capture-filter.js';
export { inferTags } from './auto-tagger.js';
