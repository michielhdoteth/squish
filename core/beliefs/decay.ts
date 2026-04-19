import { getDbClient } from '../lib/db-client.js';
import { logger } from './logger.js';

/**
 * Belief Decay Engine
 * 
 * Manages confidence decay for beliefs over time
 * Formula: newConfidence = oldConfidence * (1 - decayRate/100)^(daysSinceLastConfirmation / halfLife)
 * - Default 30 days half-life (belief confidence halves every 30 days without reinforcement)
 * - Disputed beliefs decay faster
 * - Beliefs with more sources decay slower
 */

const DEFAULT_BELIEF_HALF_LIFE = 30; // days
const DISPUTE_DECAY_MULTIPLIER = 1.5; // disputes decay 1.5x faster
const SOURCE_BOOST_THRESHOLD = 3; // 3+ sources = slower decay

interface DecayStats {
  decayed: number;
  sourceCountUpdated: number;
  errors: string[];
}

export async function applyBeliefDecay(projectId?: string): Promise<DecayStats> {
  const stats: DecayStats = { decayed: 0, sourceCountUpdated: 0, errors: [] };
  
  try {
    const { raw } = await getDbClient();
    const sqlite = (raw as any).$client;
    const isPg = typeof (raw as any).query === 'function';

    if (!sqlite && !isPg) {
      logger.warn('No database client available for belief decay');
      return stats;
    }

    const now = Date.now();
    
    if (isPg) {
      // PostgreSQL version
      const pg = raw as any;
      
      // Get all active beliefs
      const beliefResult = await pg.query(
        `SELECT id, confidence, belief_decay_rate, last_confirmed_at, status, source_count 
         FROM beliefs WHERE project_id = $1 AND status = 'active'`,
        [projectId]
      );
      
      for (const belief of beliefResult.rows) {
        try {
          const lastConfirmed = belief.last_confirmed_at ? new Date(belief.last_confirmed_at).getTime() : new Date(belief.created_at).getTime();
          const daysSince = Math.max(0, (now - lastConfirmed) / (24 * 60 * 60 * 1000));
          
          // Get source count for this belief
          const sourceResult = await pg.query(
            `SELECT COUNT(*) as cnt FROM belief_memory_sources WHERE belief_id = $1`,
            [belief.id]
          );
          const sourceCount = parseInt(sourceResult.rows[0]?.cnt ?? 1);
          
          // Calculate decay rate (disputes decay faster)
          const baseDecayRate = belief.belief_decay_rate ?? DEFAULT_BELIEF_HALF_LIFE;
          const decayMultiplier = belief.status === 'disputed' ? DISPUTE_DECAY_MULTIPLIER : 1;
          const sourceMultiplier = sourceCount >= SOURCE_BOOST_THRESHOLD ? 0.8 : 1;
          
          const effectiveHalfLife = baseDecayRate * decayMultiplier * sourceMultiplier;
          
          // Apply exponential decay: confidence = initial * (0.5)^(days/halfLife)
          const newConfidence = Math.round(
            belief.confidence * Math.pow(0.5, daysSince / effectiveHalfLife)
          );
          
          if (newConfidence < belief.confidence) {
            await pg.query(
              `UPDATE beliefs SET confidence = $1, updated_at = NOW() WHERE id = $2`,
              [newConfidence, belief.id]
            );
            stats.decayed++;
          }
          
          if (sourceCount !== belief.source_count) {
            await pg.query(
              `UPDATE beliefs SET source_count = $1 WHERE id = $2`,
              [sourceCount, belief.id]
            );
            stats.sourceCountUpdated++;
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          stats.errors.push(`Belief ${belief.id}: ${msg}`);
        }
      }
    } else if (sqlite) {
      // SQLite version
      const beliefs = sqlite.prepare(`
        SELECT id, confidence, belief_decay_rate, last_confirmed_at, status, source_count, created_at
        FROM beliefs WHERE project_id = ? AND status = 'active'
      `).all(projectId) as any[];

      for (const belief of beliefs) {
        try {
          const lastConfirmed = belief.last_confirmed_at 
            ? belief.last_confirmed_at 
            : belief.created_at;
          const daysSince = Math.max(0, (now - lastConfirmed) / (24 * 60 * 60 * 1000));
          
          // Get source count
          const sourceResult = sqlite.prepare(
            `SELECT COUNT(*) as cnt FROM belief_memory_sources WHERE belief_id = ?`
          ).get(belief.id) as any;
          const sourceCount = sourceResult?.cnt ?? 1;
          
          // Calculate decay rate
          const baseDecayRate = belief.belief_decay_rate ?? DEFAULT_BELIEF_HALF_LIFE;
          const decayMultiplier = belief.status === 'disputed' ? DISPUTE_DECAY_MULTIPLIER : 1;
          const sourceMultiplier = sourceCount >= SOURCE_BOOST_THRESHOLD ? 0.8 : 1;
          
          const effectiveHalfLife = baseDecayRate * decayMultiplier * sourceMultiplier;
          
          const newConfidence = Math.round(
            belief.confidence * Math.pow(0.5, daysSince / effectiveHalfLife)
          );
          
          if (newConfidence < belief.confidence) {
            sqlite.prepare(`
              UPDATE beliefs SET confidence = ?, updated_at = ?
              WHERE id = ?
            `).run(newConfidence, Math.floor(now / 1000), belief.id);
            stats.decayed++;
          }
          
          if (sourceCount !== belief.source_count) {
            sqlite.prepare(`
              UPDATE beliefs SET source_count = ? WHERE id = ?
            `).run(sourceCount, belief.id);
            stats.sourceCountUpdated++;
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          stats.errors.push(`Belief ${belief.id}: ${msg}`);
        }
      }
    }
    
    logger.info('Belief decay applied', stats);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error('Belief decay failed', { error: msg });
    stats.errors.push(msg);
  }
  
  return stats;
}

/**
 * Get beliefs that need attention (low confidence, disputed, or stale)
 */
export async function getProblemBeliefs(projectId: string, options?: {
  minDaysSinceConfirmation?: number;
  confidenceThreshold?: number;
}): Promise<Array<{
  id: string;
  type: string;
  statement: string;
  confidence: number;
  status: string;
  lastConfirmedAt: Date | null;
  issue: string;
}>> {
  const problems: Array<{
    id: string;
    type: string;
    statement: string;
    confidence: number;
    status: string;
    lastConfirmedAt: Date | null;
    issue: string;
  }> = [];
  
  try {
    const { raw } = await getDbClient();
    const sqlite = (raw as any).$client;
    const isPg = typeof (raw as any).query === 'function';
    
    const minDays = options?.minDaysSinceConfirmation ?? 30;
    const confThreshold = options?.confidenceThreshold ?? 20;
    const now = Date.now();
    
    if (isPg) {
      const pg = raw as any;
      const result = await pg.query(
        `SELECT id, belief_type, statement, confidence, status, last_confirmed_at, created_at
         FROM beliefs WHERE project_id = $1`,
        [projectId]
      );
      
      for (const belief of result.rows) {
        const lastConfirmed = belief.last_confirmed_at ? new Date(belief.last_confirmed_at) : new Date(belief.created_at);
        const daysSince = (now - lastConfirmed.getTime()) / (24 * 60 * 60 * 1000);
        
        let issue = '';
        if (belief.status === 'disputed') issue = 'disputed';
        else if (belief.confidence < confThreshold) issue = `low confidence (${belief.confidence})`;
        else if (daysSince > minDays) issue = `stale (${Math.round(daysSince)} days)`;
        
        if (issue) {
          problems.push({
            id: belief.id,
            type: belief.belief_type,
            statement: belief.statement,
            confidence: belief.confidence,
            status: belief.status,
            lastConfirmedAt: belief.last_confirmed_at,
            issue,
          });
        }
      }
    } else if (sqlite) {
      const beliefs = sqlite.prepare(`
        SELECT id, belief_type, statement, confidence, status, last_confirmed_at, created_at
        FROM beliefs WHERE project_id = ?
      `).all(projectId) as any[];
      
      for (const belief of beliefs) {
        const lastConfirmed = belief.last_confirmed_at 
          ? new Date(belief.last_confirmed_at * 1000) 
          : new Date(belief.created_at * 1000);
        const daysSince = (now - lastConfirmed.getTime()) / (24 * 60 * 60 * 1000);
        
        let issue = '';
        if (belief.status === 'disputed') issue = 'disputed';
        else if (belief.confidence < confThreshold) issue = `low confidence (${belief.confidence})`;
        else if (daysSince > minDays) issue = `stale (${Math.round(daysSince)} days)`;
        
        if (issue) {
          problems.push({
            id: belief.id,
            type: belief.belief_type,
            statement: belief.statement,
            confidence: belief.confidence,
            status: belief.status,
            lastConfirmedAt: belief.last_confirmed_at ? new Date(belief.last_confirmed_at * 1000) : null,
            issue,
          });
        }
      }
    }
  } catch (error) {
    logger.error('Failed to get problem beliefs', error);
  }
  
  return problems;
}

/**
 * Reinforce a belief (increase confidence when re-referenced)
 */
export async function reinforceBelief(beliefId: string, boostAmount: number = 5): Promise<boolean> {
  try {
    const { raw } = await getDbClient();
    const isPg = typeof (raw as any).query === 'function';
    
    if (isPg) {
      await (raw as any).query(
        `UPDATE beliefs SET 
          confidence = LEAST(100, confidence + $1),
          last_confirmed_at = NOW(),
          updated_at = NOW()
         WHERE id = $2`,
        [boostAmount, beliefId]
      );
    } else {
      const sqlite = (raw as any).$client;
      sqlite.prepare(`
        UPDATE beliefs SET 
          confidence = MIN(100, confidence + ?),
          last_confirmed_at = ?,
          updated_at = ?
        WHERE id = ?
      `).run(boostAmount, Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000), beliefId);
    }
    
    return true;
  } catch (error) {
    logger.error('Failed to reinforce belief', { beliefId, error });
    return false;
  }
}