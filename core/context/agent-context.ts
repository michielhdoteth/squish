/**
 * Agent Context API - Direct access for agents
 * 
 * Provides a simple API for agents to get context without CLI calls.
 * Use this instead of spawning squish CLI processes.
 * 
 * Usage:
 *   import { getAgentContext, searchWithPlace } from './core/context/agent-context.js';
 *   
 *   const context = await getAgentContext(projectPath, { task: "fix bug" });
 *   const results = await searchWithPlace(projectPath, "error fix", { limit: 5 });
 */

import { getRecent, search } from '../memory/memories.js';
import { getProjectByPath } from '../projects.js';
import { ensureProject } from '../projects.js';
import { initializeDefaultPlaces, getProjectPlaces, getMemoryPlace, getPlace, walkPlace } from '../places/index.js';
import { logger } from '../logger.js';

export interface AgentContextOptions {
  /** Current task or action (helps auto-detect relevant place) */
  task?: string;
  /** Preferred tier: quick (50 tokens), medium (170), full (500) */
  tier?: 'quick' | 'medium' | 'full';
  /** Max memories to return */
  limit?: number;
  /** Include place context */
  includePlaces?: boolean;
}

export interface SearchOptions {
  /** Query string */
  query: string;
  /** Optional place filter */
  place?: string;
  /** Max results */
  limit?: number;
  /** Memory type filter */
  type?: string;
}

/**
 * Get agent context - the main function I can call directly
 * 
 * Instead of: squish context --tier medium --has-memories
 * Use: const ctx = await getAgentContext(projectPath, { task: "fix bug", tier: "medium" })
 */
export async function getAgentContext(
  projectPath: string,
  options: AgentContextOptions = {}
): Promise<{
  ok: boolean;
  memories: Array<{
    id: string;
    type: string;
    content: string;
    place?: string;
    placeType?: string;
  }>;
  places: Array<{
    name: string;
    type: string;
    purpose?: string;
    memories: number;
    preview?: string[];
  }>;
  sessionId?: string;
  tokens?: number;
}> {
  try {
    await ensureProject(projectPath);
    const project = await getProjectByPath(projectPath);
    
    if (!project) {
      return { ok: false, memories: [], places: [] };
    }
    
    const tier = options.tier || 'medium';
    const limit = options.limit || 5;
    const includePlaces = options.includePlaces !== false;
    
    // Get recent memories
    const memories = await getRecent(projectPath, limit);
    
    // Add place info to each memory
    const memoriesWithPlace = await Promise.all(
      memories.map(async (m: any) => {
        const placeId = await getMemoryPlace(m.id);
        let placeInfo: any = {};
        if (placeId) {
          const place = await getPlace(placeId);
          placeInfo = { place: place?.name || null, placeType: place?.placeType || null };
        }
        return {
          id: m.id,
          type: m.type,
          content: m.content || m.content,
          ...placeInfo,
        };
      })
    );
    
    // Get places context
    let places: any[] = [];
    if (includePlaces) {
      await initializeDefaultPlaces(project.id);
      const projectPlaces = await getProjectPlaces(project.id);
      
      // Filter to populated places only
      const populatedPlaces = projectPlaces.filter(p => p.memoryCount > 0);
      
      if (tier === 'quick') {
        // Just names
        places = populatedPlaces.map(p => ({
          name: p.name,
          type: p.placeType,
          memories: p.memoryCount,
        }));
      } else if (tier === 'medium') {
        // Top 3 per place
        const mediumPlaces = [];
        for (const p of populatedPlaces.slice(0, 5)) {
          const walkResult = await walkPlace(project.id, p.placeType, {
            tokenBudget: 170,
            maxMemoriesPerPlace: 3,
            compressWithCompression: false,
          });
          mediumPlaces.push({
            name: p.name,
            type: p.placeType,
            purpose: p.purpose,
            memories: p.memoryCount,
            preview: walkResult?.memories.slice(0, 3).map((m: any) => m.content?.substring(0, 80)) || [],
          });
        }
        places = mediumPlaces;
      } else {
        // Full
        places = populatedPlaces.map(p => ({
          name: p.name,
          type: p.placeType,
          purpose: p.purpose,
          memories: p.memoryCount,
        }));
      }
    }
    
    // Estimate token count
    const tokens = tier === 'quick' ? 50 : tier === 'medium' ? 170 : 500;
    
    return {
      ok: true,
      memories: memoriesWithPlace,
      places,
      tokens,
    };
    
  } catch (error: any) {
    logger.error('[AgentContext] Error getting context:', error);
    return { ok: false, memories: [], places: [] };
  }
}

/**
 * Search memories with automatic place detection
 * 
 * If query contains keywords associated with a place (e.g., "fix" -> Workshop),
 * it will automatically include that place in results or boost those results.
 */
export async function searchWithPlace(
  projectPath: string,
  query: string,
  options: SearchOptions = { query, limit: 10 }
): Promise<{
  ok: boolean;
  query: string;
  autoDetectedPlace?: string;
  count: number;
  results: Array<{
    id: string;
    type: string;
    content: string;
    score: number;
    place?: string;
    placeType?: string;
  }>;
}> {
  try {
    await ensureProject(projectPath);
    const project = await getProjectByPath(projectPath);
    
    if (!project) {
      return { ok: false, query, count: 0, results: [] };
    }
    
    // Search
    const results = await search({
      query,
      type: options.type as any,
      limit: (options.limit || 10) * 2,
      project: projectPath,
    });
    
    const limited = results.slice(0, options.limit || 10);
    
    // Auto-detect place from query keywords
    const autoPlace = detectPlaceFromQuery(query);
    
    // Add place info to results
    const resultsWithPlace = await Promise.all(
      limited.map(async (r: any) => {
        const placeId = await getMemoryPlace(r.id);
        let placeInfo: any = { place: null, placeType: null };
        if (placeId) {
          const place = await getPlace(placeId);
          placeInfo = {
            place: place?.name || null,
            placeType: place?.placeType || null,
          };
        }
        return {
          id: r.id,
          type: r.type,
          content: r.content,
          score: r.similarity ?? 0,
          ...placeInfo,
        };
      })
    );
    
    // Filter by place if specified or auto-detected
    let filtered = resultsWithPlace;
    const placeFilter = options.place || autoPlace;
    if (placeFilter) {
      filtered = resultsWithPlace.filter((r: any) => r.placeType === placeFilter);
    }
    
    return {
      ok: true,
      query,
      autoDetectedPlace: autoPlace || undefined,
      count: filtered.length,
      results: filtered,
    };
    
  } catch (error: any) {
    logger.error('[AgentContext] Error searching:', error);
    return { ok: false, query, count: 0, results: [] };
  }
}

/**
 * Detect place type from query keywords
 * 
 * Maps common terms to place types:
 * - fix, bug, error, issue -> workshop (fixing stuff)
 * - design, plan, architecture, api -> library (learning/docs)
 * - task, todo, manage, organize -> office (work management)
 * - code, implement, feature -> workshop
 * - research, learn, study -> library
 * - experiment, test, try -> lab
 * - review, archive -> archive
 */
function detectPlaceFromQuery(query: string): string | null {
  const q = query.toLowerCase();
  
  // Map keywords to places
  const keywords: Record<string, string[]> = {
    workshop: ['fix', 'bug', 'error', 'issue', 'code', 'implement', 'feature', 'refactor', 'debug'],
    library: ['design', 'plan', 'architecture', 'api', 'learn', 'research', 'study', 'documentation', 'docs'],
    office: ['task', 'todo', 'manage', 'organize', 'schedule', 'meeting', 'project'],
    lab: ['test', 'experiment', 'try', 'verify', 'prototype', 'poc'],
    garden: ['idea', 'brainstorm', 'create', 'design', 'concept'],
    archive: ['review', 'archive', 'old', 'past', 'historical'],
  };
  
  // Check each place's keywords
  for (const [placeType, words] of Object.entries(keywords)) {
    for (const word of words) {
      if (q.includes(word)) {
        return placeType;
      }
    }
  }
  
  return null;
}

/**
 * Get single memory with place info
 */
export async function getMemoryWithPlace(
  projectPath: string,
  memoryId: string
): Promise<{
  ok: boolean;
  memory?: {
    id: string;
    type: string;
    content: string;
    tags: string[];
    createdAt: Date;
    place?: string;
    placeType?: string;
  };
}> {
  try {
    const { getMemory } = await import('../memory/memories.js');
    const memory = await getMemory(memoryId);
    
    if (!memory) {
      return { ok: false };
    }
    
    // Get place info
    const placeId = await getMemoryPlace(memoryId);
    let placeInfo: any = {};
    if (placeId) {
      const place = await getPlace(placeId);
      placeInfo = {
        place: place?.name || null,
        placeType: place?.placeType || null,
      };
    }
    
    return {
      ok: true,
      memory: {
        id: memory.id,
        type: memory.type,
        content: memory.content || '',
        tags: memory.tags || [],
        createdAt: memory.createdAt,
        ...placeInfo,
      },
    };
    
  } catch (error: any) {
    logger.error('[AgentContext] Error getting memory:', error);
    return { ok: false };
  }
}

/**
 * Quick context for session start - lightweight version
 * Use this when you just need the basics without full context
 */
export async function getQuickContext(
  projectPath: string,
  limit: number = 3
): Promise<{
  ok: boolean;
  memories: Array<{ id: string; type: string; content: string }>;
  activePlaces: string[];
}> {
  try {
    await ensureProject(projectPath);
    const project = await getProjectByPath(projectPath);
    
    if (!project) {
      return { ok: false, memories: [], activePlaces: [] };
    }
    
    // Get recent memories
    const memories = await getRecent(projectPath, limit);
    
    // Get places with memories
    await initializeDefaultPlaces(project.id);
    const places = await getProjectPlaces(project.id);
    const activePlaces = places
      .filter(p => p.memoryCount > 0)
      .map(p => p.name);
    
    return {
      ok: true,
      memories: memories.map((m: any) => ({
        id: m.id,
        type: m.type,
        content: m.content?.substring(0, 100) || '',
      })),
      activePlaces,
    };
    
  } catch (error: any) {
    logger.error('[AgentContext] Error getting quick context:', error);
    return { ok: false, memories: [], activePlaces: [] };
  }
}