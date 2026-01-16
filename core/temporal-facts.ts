/**
 * Temporal Facts System
 * Manages versioned facts with validity windows
 */

import { and, eq, lte, gte, or, isNull, desc } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { getDb } from '../db/index.js';
import { getSchema } from '../db/schema.js';
import { traverseSupersededChain } from './utils/history-traversal.js';
import { createNewFactVersion } from './utils/version-management.js';
import { buildFactAtTimeQuery } from './utils/temporal-queries.js';

/**
 * Store a new fact with temporal validity
 */
export async function storeFact(
  content: string,
  options: {
    validFrom?: Date;
    validTo?: Date;
    confidence?: number;
    tags?: string[];
    projectId?: string;
  } = {}
): Promise<string> {
  try {
    const db = await getDb();
    const schema = await getSchema();

    const factId = randomUUID();

    await (db as any).insert(schema.memories).values({
      id: factId,
      type: 'fact',
      sector: 'semantic',
      content,
      confidence: options.confidence || 100,
      validFrom: options.validFrom || new Date(),
      validTo: options.validTo || null,
      version: 1,
      tags: options.tags || [],
      projectId: options.projectId || null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return factId;
  } catch (error) {
    console.error('[squish] Error storing fact:', error);
    throw error;
  }
}

/**
 * Update a fact by creating a new version
 */
export async function updateFact(
  previousFactId: string,
  newContent: string,
  reason: string
): Promise<string> {
  return createNewFactVersion(previousFactId, newContent, {}, reason);
}

/**
 * Query facts valid at a specific point in time
 */
export async function queryFactsAtTime(
  timestamp: Date = new Date(),
  options: {
    minConfidence?: number;
    tags?: string[];
    projectId?: string;
    limit?: number;
  } = {}
): Promise<any[]> {
  try {
    const db = await getDb();
    const schema = await getSchema();

    const minConfidence = options.minConfidence || 0;
    const limit = options.limit || 100;

    const additionalFilters = [gte(schema.memories.confidence as any, minConfidence)];
    if (options.projectId) {
      additionalFilters.push(eq(schema.memories.projectId, options.projectId));
    }

    const where = buildFactAtTimeQuery(schema, timestamp, additionalFilters);

    const results = await (db as any)
      .select()
      .from(schema.memories)
      .where(where)
      .orderBy(desc(schema.memories.confidence))
      .limit(limit);

    return results;
  } catch (error) {
    console.error('[squish] Error querying facts at time:', error);
    return [];
  }
}

/**
 * Get the complete version history of a fact
 */
export async function getFactHistory(factId: string): Promise<any[]> {
  return traverseSupersededChain(factId);
}

/**
 * Apply confidence decay based on temporal distance
 */
export async function applyConfidenceDecay(factId: string, ageDays: number): Promise<void> {
  try {
    const db = await getDb();
    const schema = await getSchema();

    // Confidence decays exponentially: newConfidence = originalConfidence * e^(-lambda * ageDays)
    // Using lambda = 0.01 for moderate decay
    const decayFactor = Math.exp(-0.01 * ageDays);

    const fact = await (db as any)
      .select()
      .from(schema.memories)
      .where(eq(schema.memories.id, factId))
      .limit(1);

    if (fact.length === 0) return;

    const newConfidence = Math.max(0, Math.floor(fact[0].confidence * decayFactor));

    await (db as any)
      .update(schema.memories)
      .set({ confidence: newConfidence })
      .where(eq(schema.memories.id, factId));
  } catch (error) {
    console.error('[squish] Error applying confidence decay:', error);
  }
}

/**
 * Invalidate a fact (mark as no longer valid)
 */
export async function invalidateFact(factId: string, reason: string): Promise<void> {
  try {
    const db = await getDb();
    const schema = await getSchema();

    await (db as any)
      .update(schema.memories)
      .set({
        validTo: new Date(),
        metadata: { invalidationReason: reason, invalidatedAt: new Date().toISOString() },
      })
      .where(eq(schema.memories.id, factId));
  } catch (error) {
    console.error('[squish] Error invalidating fact:', error);
  }
}

/**
 * Check if a fact is currently valid
 */
export async function isFactValid(factId: string, atTime: Date = new Date()): Promise<boolean> {
  try {
    const db = await getDb();
    const schema = await getSchema();

    const additionalFilters = [eq(schema.memories.id, factId)];
    const where = buildFactAtTimeQuery(schema, atTime, additionalFilters);

    const fact = await (db as any)
      .select()
      .from(schema.memories)
      .where(where)
      .limit(1);

    return fact.length > 0;
  } catch (error) {
    console.error('[squish] Error checking fact validity:', error);
    return false;
  }
}

/**
 * Get statistics about facts
 */
export async function getFactStats(projectId?: string): Promise<{
  totalFacts: number;
  activeFacts: number;
  expiredFacts: number;
  avgConfidence: number;
  avgAge: number;
}> {
  try {
    const db = await getDb();
    const schema = await getSchema();

    const now = new Date();
    const where = projectId
      ? and(eq(schema.memories.type as any, 'fact'), eq(schema.memories.projectId, projectId))
      : eq(schema.memories.type as any, 'fact');

    const facts = await (db as any).select().from(schema.memories).where(where);

    let active = 0;
    let expired = 0;
    let totalConfidence = 0;
    let totalAge = 0;

    for (const fact of facts) {
      totalConfidence += fact.confidence || 0;

      if (fact.validTo && new Date(fact.validTo) < now) {
        expired++;
      } else if (!fact.validTo || new Date(fact.validTo) >= now) {
        active++;
      }

      totalAge += (now.getTime() - new Date(fact.createdAt).getTime()) / (1000 * 60 * 60 * 24);
    }

    return {
      totalFacts: facts.length,
      activeFacts: active,
      expiredFacts: expired,
      avgConfidence: facts.length > 0 ? totalConfidence / facts.length : 0,
      avgAge: facts.length > 0 ? totalAge / facts.length : 0,
    };
  } catch (error) {
    console.error('[squish] Error getting fact stats:', error);
    return {
      totalFacts: 0,
      activeFacts: 0,
      expiredFacts: 0,
      avgConfidence: 0,
      avgAge: 0,
    };
  }
}
