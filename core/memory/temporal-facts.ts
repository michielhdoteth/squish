/**
 * Temporal Facts Lifecycle
 * Manages temporal fact validity, supersession, and expiration
 * Integrates with the memory pipeline to automatically supersede outdated facts
 */

import { eq, and, lt, gt, inArray } from 'drizzle-orm';
import { getDb } from '../../db/index.js';
import { getSchema } from '../../db/schema.js';
import { logger } from '../logger.js';
import { createAssociation } from '../associations.js';
import { parseTemporalFacts, TemporalFact } from './temporal-parser.js';

export interface TemporalValidityCheck {
  isValid: boolean;
  supersededBy?: string;
  expiresAt?: Date;
  confidence: number;
}

export interface SupersessionResult {
  supersededCount: number;
  newValidFrom: Date;
  newValidTo?: Date;
}

/**
 * Check temporal validity of a memory
 * Returns whether the memory is still valid based on temporal facts
 */
export async function checkTemporalValidity(memoryId: string): Promise<TemporalValidityCheck> {
  try {
    const db = await getDb();
    if (!db) {
      // Graceful fallback when database is unavailable
      return { isValid: true, confidence: 0.5 };
    }
    const schema = await getSchema();
    
    const memories = await (db as any)
      .select()
      .from(schema.memories)
      .where(eq(schema.memories.id, memoryId))
      .limit(1);
    
    if (memories.length === 0) {
      return { isValid: false, confidence: 0 };
    }
    
    const memory = memories[0];
    const now = new Date();
    
    // Check if memory has explicit validity period
    if (memory.validTo) {
      const validTo = new Date(memory.validTo);
      if (validTo < now) {
        // Find if there's a superseding memory
        const superseding = await (db as any)
          .select()
          .from(schema.memories)
          .where(eq(schema.memories.supersedes, memoryId))
          .limit(1);
        
        return {
          isValid: false,
          supersededBy: superseding[0]?.id,
          expiresAt: validTo,
          confidence: 0.95,
        };
      }
    }
    
    // Parse temporal facts from content
    const temporalFacts = await parseTemporalFacts(memory.content);
    
    // Check for expiration indicators
    for (const fact of temporalFacts) {
      if (fact.parsed.end && new Date(fact.parsed.end) < now) {
        return {
          isValid: false,
          expiresAt: new Date(fact.parsed.end),
          confidence: fact.confidence,
        };
      }
    }
    
    return { isValid: true, confidence: 1.0 };
    
  } catch (error) {
    logger.error('Error checking temporal validity', error);
    return { isValid: true, confidence: 0.5 }; // Assume valid on error
  }
}

/**
 * Auto-supersede temporal facts that have been updated
 * Call this when storing a new memory that may supersede old temporal facts
 */
export async function supersedeOldTemporalFacts(
  newMemoryId: string,
  content: string,
  projectId?: string
): Promise<SupersessionResult> {
  const result: SupersessionResult = {
    supersededCount: 0,
    newValidFrom: new Date(),
  };

  try {
    const db = await getDb();
    if (!db) {
      // Graceful fallback when database is unavailable
      return result;
    }
    const schema = await getSchema();
    
    // Parse temporal facts from new content
    const temporalFacts = await parseTemporalFacts(content);
    
    if (temporalFacts.length === 0) {
      return result;
    }
    
    // Find the earliest date as validFrom
    const dates = temporalFacts
      .filter(f => f.parsed.start)
      .map(f => new Date(f.parsed.start!));
    
    if (dates.length > 0) {
      result.newValidFrom = new Date(Math.min(...dates.map(d => d.getTime())));
    }
    
    // Find memories in same project with overlapping temporal scope
    const whereClause = projectId
      ? and(
          eq(schema.memories.projectId, projectId),
          eq(schema.memories.status, 'active')
        )
      : eq(schema.memories.status, 'active');
    
    const candidates = await (db as any)
      .select()
      .from(schema.memories)
      .where(whereClause)
      .limit(100);
    
    const toSupersede: string[] = [];
    
    for (const candidate of candidates) {
      if (candidate.id === newMemoryId) continue;
      if (candidate.isProtected) continue;
      
      // Check for temporal overlap
      const candidateFacts = await parseTemporalFacts(candidate.content);
      
      for (const newFact of temporalFacts) {
        for (const candidateFact of candidateFacts) {
          if (factsOverlap(newFact, candidateFact)) {
            // Check if new fact is more recent
            if (isMoreRecent(newFact, candidateFact)) {
              toSupersede.push(candidate.id);
              break;
            }
          }
        }
      }
    }
    
    // Apply supersession
    if (toSupersede.length > 0) {
      const now = new Date();

      // Batch 6b fix: update ALL toSupersede ids (was: only toSupersede[0]
      // despite the "Batch for all" comment).
      await (db as any)
        .update(schema.memories)
        .set({
          status: 'superseded',
          supersededBy: newMemoryId,
          supersededAt: now,
          updatedAt: now,
        })
        .where(inArray(schema.memories.id, toSupersede));

      // Batch 6b fix: persist the computed newValidFrom onto the superseding
      // memory so its bi-temporal valid_from reflects the fact's actual
      // validity start instead of staying null.
      await (db as any)
        .update(schema.memories)
        .set({ validFrom: result.newValidFrom, updatedAt: now })
        .where(eq(schema.memories.id, newMemoryId));

      // Create associations
      for (const oldId of toSupersede) {
        await createAssociation(newMemoryId, oldId, 'supersedes', 0.85);
      }
      
      result.supersededCount = toSupersede.length;
      
      logger.info('Superseded temporal facts', {
        newMemoryId,
        supersededCount: toSupersede.length,
      });
    }
    
  } catch (error) {
    logger.error('Error superseding temporal facts', error);
  }
  
  return result;
}

/**
 * Check if two temporal facts overlap in time
 */
function factsOverlap(fact1: TemporalFact, fact2: TemporalFact): boolean {
  // Both need start dates to compare
  if (!fact1.parsed.start || !fact2.parsed.start) {
    return false;
  }
  
  const start1 = new Date(fact1.parsed.start).getTime();
  const end1 = fact1.parsed.end ? new Date(fact1.parsed.end).getTime() : Infinity;
  const start2 = new Date(fact2.parsed.start).getTime();
  const end2 = fact2.parsed.end ? new Date(fact2.parsed.end).getTime() : Infinity;
  
  // Check for overlap
  return start1 <= end2 && start2 <= end1;
}

/**
 * Check if fact1 is more recent than fact2
 */
function isMoreRecent(fact1: TemporalFact, fact2: TemporalFact): boolean {
  if (!fact1.parsed.start) return false;
  if (!fact2.parsed.start) return true;
  
  const date1 = new Date(fact1.parsed.start).getTime();
  const date2 = new Date(fact2.parsed.start).getTime();
  
  return date1 > date2;
}

/**
 * Clean up expired temporal facts
 * Can be run as a background job
 */
export async function cleanupExpiredTemporalFacts(projectId?: string): Promise<number> {
  let expiredCount = 0;

  try {
    const db = await getDb();
    if (!db) {
      // Graceful fallback when database is unavailable
      return 0;
    }
    const schema = await getSchema();
    const now = new Date();
    
    const whereClause = projectId
      ? and(
          eq(schema.memories.projectId, projectId),
          eq(schema.memories.status, 'active'),
          lt(schema.memories.validTo, now)
        )
      : and(
          eq(schema.memories.status, 'active'),
          lt(schema.memories.validTo, now)
        );
    
    const expired = await (db as any)
      .select()
      .from(schema.memories)
      .where(whereClause);
    
    for (const memory of expired) {
      if (memory.isProtected) continue;
      
      await (db as any)
        .update(schema.memories)
        .set({
          status: 'expired',
          expiredAt: now,
          updatedAt: now,
        })
        .where(eq(schema.memories.id, memory.id));
      
      expiredCount++;
    }
    
    if (expiredCount > 0) {
      logger.info('Cleaned up expired temporal facts', { expiredCount });
    }
    
  } catch (error) {
    logger.error('Error cleaning up expired temporal facts', error);
  }
  
  return expiredCount;
}

/**
 * Get temporal fact statistics for a project
 */
export async function getTemporalFactsStats(projectId?: string): Promise<{
  totalTemporalFacts: number;
  validFacts: number;
  expiredFacts: number;
  supersededFacts: number;
}> {
  try {
    const db = await getDb();
    if (!db) {
      // Graceful fallback when database is unavailable
      return {
        totalTemporalFacts: 0,
        validFacts: 0,
        expiredFacts: 0,
        supersededFacts: 0,
      };
    }
    const schema = await getSchema();
    const now = new Date();
    
    const whereClause = projectId
      ? eq(schema.memories.projectId, projectId)
      : undefined;
    
    const memories = await (db as any)
      .select()
      .from(schema.memories)
      .where(whereClause);
    
    let totalTemporalFacts = 0;
    let validFacts = 0;
    let expiredFacts = 0;
    let supersededFacts = 0;
    
    for (const memory of memories) {
      // Check if memory has temporal facts
      const facts = await parseTemporalFacts(memory.content);
      if (facts.length > 0) {
        totalTemporalFacts++;
        
        if (memory.status === 'expired') {
          expiredFacts++;
        } else if (memory.status === 'superseded') {
          supersededFacts++;
        } else if (memory.status === 'active') {
          // Check if still valid
          if (memory.validTo && new Date(memory.validTo) < now) {
            expiredFacts++;
          } else {
            validFacts++;
          }
        }
      }
    }
    
    return { totalTemporalFacts, validFacts, expiredFacts, supersededFacts };
    
  } catch (error) {
    logger.error('Error getting temporal facts stats', error);
    return { totalTemporalFacts: 0, validFacts: 0, expiredFacts: 0, supersededFacts: 0 };
  }
}
