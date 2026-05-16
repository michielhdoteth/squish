/**
 * Decay Engine - Ebbinghaus Power-Law Implementation
 * 
 * Replaces linear decay with Ebbinghaus power-law decay for more accurate
 * memory retention modeling based on the forgetting curve.
 * 
 * Reference: Squish v2.0 Architecture Design, Section 7 - Decay Function
 */

import { ebbinghausRetention, ebbinghausScore, getDefaultDecayParams, type DecayParams } from './ebbinghaus.js';
import { getDbClient } from '../lib/db-client.js';
import { logger } from '../logger.js';

/**
 * Memory types and their decay characteristics
 * Based on research from Squish v2.0 architecture:
 * - episodic: β=0.07 (slow decay)
 * - semantic: β=0.02 (very slow)
 * - procedural: β=0.03 (slow)
 * - self-model: β=0.01 (very slow)
 * - introspective: β=0.02 (slow)
 */
export type MemoryType = 'episodic' | 'semantic' | 'procedural' | 'self-model' | 'introspective' | 'default';

export interface MemoryForDecay {
  id: string;
  score: number;
  memoryType?: string;
  lastDecayAt: Date | string | number;
  createdAt: Date | string | number;
  tau?: number;
  beta?: number;
}

export interface DecayEngineStats {
  processed: number;
  updated: number;
  errors: string[];
}

/**
 * Apply Ebbinghaus decay to a single memory
 * 
 * @param memory - Memory object with required fields
 * @returns New decayed score
 */
export function applyEbbinghausDecay(memory: MemoryForDecay): number {
  // Get decay parameters
  const params: DecayParams = {
    tau: memory.tau ?? getDefaultDecayParams(memory.memoryType || 'default').tau,
    beta: memory.beta ?? getDefaultDecayParams(memory.memoryType || 'default').beta,
    lastDecayAt: new Date(memory.lastDecayAt),
    createdAt: new Date(memory.createdAt)
  };
  
  // Calculate decayed score
  const newScore = ebbinghausScore(memory.score, params);
  
  return newScore;
}

/**
 * Update decay scores for all memories in the database
 * Uses Ebbinghaus power-law decay instead of linear decay
 * 
 * @param projectId - Optional project ID to filter memories
 * @returns Statistics about the decay operation
 */
export async function updateAllDecayScores(projectId?: string): Promise<DecayEngineStats> {
  const stats: DecayEngineStats = {
    processed: 0,
    updated: 0,
    errors: []
  };
  
  try {
    const { raw } = await getDbClient();
    const sqlite = (raw as any)?.$client;
    const isPg = typeof (raw as any)?.query === 'function';
    
    if (!sqlite && !isPg) {
      logger.warn('No database client available for decay engine');
      return stats;
    }
    
    const now = Date.now();
    
    if (isPg) {
      // PostgreSQL version
      const pg = raw as any;
      
      // Get all active memories
      const query = projectId
        ? `SELECT id, relevance_score, type, last_decay_at, created_at, decay_rate
           FROM memories WHERE project_id = $1 AND status = 'active'`
        : `SELECT id, relevance_score, type, last_decay_at, created_at, decay_rate
           FROM memories WHERE status = 'active'`;
      
      const result = await pg.query(query, projectId ? [projectId] : []);
      
      for (const mem of result.rows) {
        try {
          stats.processed++;
          
          const memory: MemoryForDecay = {
            id: mem.id,
            score: mem.relevance_score || 100,
            memoryType: mem.type,
            lastDecayAt: mem.last_decay_at || mem.created_at,
            createdAt: mem.created_at,
            tau: mem.decay_rate,
            beta: undefined
          };
          
          const newScore = applyEbbinghausDecay(memory);
          
          // Update if score changed significantly (more than 0.5)
          if (Math.abs(newScore - memory.score) > 0.5) {
            await pg.query(
              `UPDATE memories SET relevance_score = $1, last_decay_at = NOW(), updated_at = NOW() WHERE id = $2`,
              [Math.round(newScore), mem.id]
            );
            stats.updated++;
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          stats.errors.push(`Memory ${mem.id}: ${msg}`);
        }
      }
    } else if (sqlite) {
      // SQLite version
      const query = projectId
        ? `SELECT id, relevance_score, type, last_decay_at, created_at, decay_rate
           FROM memories WHERE project_id = ? AND status = 'active'`
        : `SELECT id, relevance_score, type, last_decay_at, created_at, decay_rate
           FROM memories WHERE status = 'active'`;
      
      const memories = sqlite.prepare(query).all(projectId || null) as any[];
      
      for (const mem of memories) {
        try {
          stats.processed++;
          
          const memory: MemoryForDecay = {
            id: mem.id,
            score: mem.relevance_score || 100,
            memoryType: mem.type,
            lastDecayAt: mem.last_decay_at ? mem.last_decay_at * 1000 : mem.created_at * 1000,
            createdAt: mem.created_at * 1000,
            tau: mem.decay_rate,
            beta: undefined
          };
          
          const newScore = applyEbbinghausDecay(memory);
          
          // Update if score changed significantly
          if (Math.abs(newScore - memory.score) > 0.5) {
            sqlite.prepare(`
              UPDATE memories SET relevance_score = ?, last_decay_at = ?, updated_at = ?
              WHERE id = ?
            `).run(Math.round(newScore), Math.floor(now / 1000), Math.floor(now / 1000), mem.id);
            stats.updated++;
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          stats.errors.push(`Memory ${mem.id}: ${msg}`);
        }
      }
    }
    
    logger.info('Ebbinghaus decay applied', stats);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error('Decay engine failed', { error: msg });
    stats.errors.push(msg);
  }
  
  return stats;
}

/**
 * Calculate retention for a memory at a specific time
 * Useful for previewing what the retention will be
 * 
 * @param memory - Memory object
 * @param targetDate - Date to calculate retention for (default: now)
 * @returns Retention value between 0 and 1
 */
export function previewRetention(
  memory: MemoryForDecay,
  targetDate?: Date
): number {
  const target = targetDate || new Date();
  const params: DecayParams = {
    tau: memory.tau ?? getDefaultDecayParams(memory.memoryType || 'default').tau,
    beta: memory.beta ?? getDefaultDecayParams(memory.memoryType || 'default').beta,
    lastDecayAt: new Date(memory.lastDecayAt),
    createdAt: new Date(memory.createdAt)
  };
  
  // Calculate days between lastDecayAt and targetDate
  const lastDecayTime = new Date(memory.lastDecayAt).getTime();
  const targetTime = target.getTime();
  const msPerDay = 1000 * 60 * 60 * 24;
  const t = Math.max(0, (targetTime - lastDecayTime) / msPerDay); // t can't be negative
  
  // Calculate retention with the target t: R(t) = (1 + t/τ)^(-β)
  const retention = Math.pow(1 + t / params.tau, -params.beta);
  
  // Clamp to [0, 1] for safety
  return Math.max(0, Math.min(1, retention));
}

/**
 * Get decay parameters for a memory type
 * Exported for use by other modules
 */
export { getDefaultDecayParams };

export type { DecayParams };
