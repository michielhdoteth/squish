/**
 * Walking Interface - Sequential memory retrieval through places
 * 
 * Implements place walking through memory places:
 * - Walk single place to get memories in order
 * - Walk all places for full tour
 * - Token budget handling with TOON compression
 */

import { getDb } from '../../db/index.js';
import { getSchema } from '../../db/schema.js';
import { getProjectPlaces, type Place } from './places.js';
import { getPlaceMemories } from './memory-places.js';
import { getMemory } from '../memory/memories.js';
import { compressForContext, isCompressed } from '../compression.js';
import { logger } from '../logger.js';

export interface WalkOptions {
  tokenBudget?: number;  // Max tokens (default: 170)
  maxMemoriesPerPlace?: number;
  includePurpose?: boolean;
  compressWithCompression?: boolean;
}

export interface WalkResult {
  place: Place;
  memories: MemorySummary[];
  totalTokens: number;
  truncated: boolean;
}

export interface MemorySummary {
  id: string;
  content: string;
  type: string;
  tags: string[];
  createdAt: string;
}

/**
 * Walk through a single place
 */
export async function walkPlace(
  projectId: string,
  placeType: string,
  options: WalkOptions = {}
): Promise<WalkResult | null> {
  const { tokenBudget = 170, maxMemoriesPerPlace = 10, includePurpose = true, compressWithCompression = false } = options;

  // Get the place
  const places = await getProjectPlaces(projectId);
  const place = places.find(p => p.placeType === placeType);
  
  if (!place) {
    logger.warn(`[Walking] Place not found: ${placeType}`);
    return null;
  }

  // Get memory IDs for this place
  const memoryIds = await getPlaceMemories(place.id, maxMemoriesPerPlace);

  // Get full memories
  const memories: MemorySummary[] = [];
  let totalTokens = 0;

  for (const memoryId of memoryIds) {
    const memory = await getMemory(memoryId);
    if (!memory) continue;

    let content = memory.content || '';
    
    // Compress with TOON if requested
    if (compressWithCompression && content) {
      content = compressForContext(content);
    }

    const tokenEstimate = Math.ceil(content.length / 4); // rough token estimate
    
    if (totalTokens + tokenEstimate > tokenBudget) {
      // Would exceed budget - stop adding
      break;
    }

    memories.push({
      id: memory.id,
      content,
      type: memory.type,
      tags: memory.tags || [],
      createdAt: memory.createdAt || '',
    });

    totalTokens += tokenEstimate;
  }

  return {
    place,
    memories,
    totalTokens,
    truncated: memories.length < memoryIds.length,
  };
}

/**
  * Walk through all places in sort order
 */
export async function walkAllPlaces(
  projectId: string,
  options: WalkOptions = {}
): Promise<WalkResult[]> {
  const places = await getProjectPlaces(projectId);
  const results: WalkResult[] = [];

  for (const place of places) {
    const walkResult = await walkPlace(projectId, place.placeType, options);
    if (walkResult && walkResult.memories.length > 0) {
      results.push(walkResult);
    }
  }

  logger.info(`[Walking] Walked ${results.length} places for project ${projectId}`);
  return results;
}

/**
 * Quick tour - just place names and purposes (minimal tokens)
 */
export async function quickTour(projectId: string): Promise<{
  places: { name: string; purpose: string; memoryCount: number }[];
  totalMemories: number;
}> {
  const places = await getProjectPlaces(projectId);
  
  return {
    places: places.map(p => ({
      name: p.name,
      purpose: p.purpose || '',
      memoryCount: p.memoryCount,
    })),
    totalMemories: places.reduce((sum, p) => sum + p.memoryCount, 0),
  };
}

/**
 * Get context summary for a place (for injection)
 */
export async function getPlaceContext(
  projectId: string,
  placeType: string,
  maxTokens: number = 50
): Promise<string> {
  const walkResult = await walkPlace(projectId, placeType, {
    tokenBudget: maxTokens,
    compressWithCompression: true,
  });

  if (!walkResult || walkResult.memories.length === 0) {
    return '';
  }

  const lines = walkResult.memories.map((m, i) => 
    `${i + 1}. [${m.type}] ${m.content.substring(0, 100)}`
  );

  return `## ${walkResult.place.name}\n${lines.join('\n')}`;
}

/**
 * Full context for session start (all places)
 */
export async function getFullWalkingContext(
  projectId: string,
  maxTokens: number = 170
): Promise<string> {
  const results = await walkAllPlaces(projectId, {
    tokenBudget: Math.floor(maxTokens / 7), // Distribute across 7 places
    compressWithCompression: true,
  });

  if (results.length === 0) {
    return 'No memories yet. Start building your spatial memory!';
  }

  const sections = results.map(r => {
    const lines = r.memories.slice(0, 3).map((m, i) => 
      `  ${i + 1}. ${m.content.substring(0, 60)}...`
    ).join('\n');
    
    return `## ${r.place.name}\n${lines}`;
  });

  return sections.join('\n\n');
}
