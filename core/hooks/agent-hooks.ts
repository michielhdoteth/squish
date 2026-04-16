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
  
  const allContent = formatted + placesContext;
  
  logger.info(`[Hooks] Injected ${memories.length} memories for session start`);
  
  return {
    memories: allContent ? allContent.split('\n') : [],
    sessionId: currentSessionId,
    count: memories.length,
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
    return { captured: false, reason: `Tool ${toolName} filtered out` };
  }
  
  // Extract relevant information
  const category = categorizeTool(toolName);
  const target = extractTarget(toolName, toolInput);
  const content = extractContent(toolName, toolInput, toolResult);
  
  // Infer tags from context
  const tags = inferTags(toolName, toolInput, content);
  
  // Create learning/observation
  const learningInput: LearningInput = {
    type: 'insight',
    content: `[${category}] ${content}`,
    action: toolName,
    target,
    project: projectPath,
    autoLink: true,
  };
  
  try {
    const learning = await createLearning(learningInput);
    
    logger.info(`[Hooks] Captured ${toolName} → ${learning.id} (session: ${currentSessionId})`);
    
    // Auto-assign to place (if places are initialized)
    try {
      const project = await getProjectByPath(projectPath);
      if (project) {
        // Initialize default places if they don't exist
        await initializeDefaultPlaces(project.id);
        
        // Auto-assign the memory to a place
        await autoAssignMemory({
          memoryId: learning.id,
          projectId: project.id,
          toolName,
          content: learningInput.content,
          tags,
        });
      }
    } catch (placeError) {
      // Don't fail the hook if place assignment fails
      logger.warn(`[Hooks] Place assignment failed: ${placeError}`);
    }
    
    return {
      captured: true,
      memoryId: learning.id,
    };
  } catch (error) {
    logger.error(`[Hooks] Failed to capture:`, error);
    return { captured: false, reason: 'Failed to create learning' };
  }
}

/**
 * Session end hook - save snapshot and sync
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