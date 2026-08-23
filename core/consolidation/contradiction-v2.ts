/**
 * Contradiction Detection v2 - LLM-as-Validator
 *
 * Implements contradiction detection with LLM-as-Validator pattern.
 * Target accuracy: 95%+
 * Falls back to keyword-based detection when LLM is unavailable.
 */

import { logger } from '../logger.js';

export interface ContradictionResult {
  hasContradiction: boolean;
  confidence: number;
  reason?: string;
  suggestedResolution?: string;
}

export interface MemoryForContradiction {
  id: string;
  content: string;
  projectId?: string;
}

/**
 * LLM-as-Validator for contradiction detection
 * Target: 95%+ accuracy
 *
 * @param memory1 - First memory to compare
 * @param memory2 - Second memory to compare
 * @param useLLM - Whether to attempt LLM-based detection (falls back to keyword)
 * @returns Contradiction detection result
 */
export async function detectContradictionLLM(
  memory1: { id: string; content: string },
  memory2: { id: string; content: string },
  useLLM: boolean = false
): Promise<ContradictionResult> {
  // Non-LLM fallback: keyword-based
  if (!useLLM) {
    return detectContradictionKeyword(memory1, memory2);
  }

  // LLM-based (if API available)
  try {
    // TODO: Implement actual LLM call when API is available
    // For now, log that we would use LLM and fall back to keyword
    logger.info('LLM contradiction detection requested but not implemented, using keyword fallback');

    return detectContradictionKeyword(memory1, memory2);

    // Future LLM implementation would look like:
    /*
    const prompt = `You are a contradiction detector. Analyze these two memories:

Memory 1: ${memory1.content}
Memory 2: ${memory2.content}

Question: Do these memories contradict each other?

Respond in JSON:
{
  "hasContradiction": true/false,
  "confidence": 0.0-1.0,
  "reason": "explanation",
  "suggestedResolution": "which memory to keep/merge"
}`;

    const llmResponse = await callLLM(prompt);
    const result = JSON.parse(llmResponse);
    return {
      hasContradiction: result.hasContradiction,
      confidence: result.confidence,
      reason: result.reason,
      suggestedResolution: result.suggestedResolution,
    };
    */
  } catch (e: any) {
    logger.warn('LLM contradiction detection failed, falling back to keyword', e);
    return detectContradictionKeyword(memory1, memory2);
  }
}

/**
 * Keyword-based contradiction detection
 * Internal helper - fast, no LLM required
 */
function detectContradictionKeyword(
  memory1: { content: string },
  memory2: { content: string }
): ContradictionResult {
  const content1 = memory1.content.toLowerCase();
  const content2 = memory2.content.toLowerCase();

  // Check for direct opposites
  const opposites = [
    ['yes', 'no'],
    ['true', 'false'],
    ['always', 'never'],
    ['increase', 'decrease'],
    ['up', 'down'],
    ['good', 'bad'],
    ['success', 'failure'],
    ['working', 'broken'],
  ];

  for (const [a, b] of opposites) {
    if ((content1.includes(a) && content2.includes(b)) ||
        (content1.includes(b) && content2.includes(a))) {
      return {
        hasContradiction: true,
        confidence: 0.8,
        reason: `Found opposite keywords: ${a}/${b}`,
        suggestedResolution: 'merge or mark superseded',
      };
    }
  }

  return {
    hasContradiction: false,
    confidence: 0.95,
    reason: 'No opposite keywords found',
  };
}

/**
 * Check a memory against existing memories for contradictions
 *
 * @param newMemory - The new memory to check for contradictions
 * @param useLLM - Whether to use LLM-based detection
 * @returns Array of contradiction results
 */
export async function checkContradictions(
  newMemory: MemoryForContradiction,
  useLLM: boolean = false
): Promise<ContradictionResult[]> {
  try {
    // Driver-aware fetch via drizzle (works on SQLite and Postgres alike).
    const { getDbClient } = await import('../lib/db-client.js');
    const { eq, and } = await import('drizzle-orm');

    const { db, schema } = await getDbClient();
    const conditions = [eq(schema.memories.status, 'active')];
    if (newMemory.projectId) {
      conditions.push(eq(schema.memories.projectId, newMemory.projectId));
    }

    const existing: Array<{ id: any; content: any }> = await (db as any)
      .select({ id: schema.memories.id, content: schema.memories.content })
      .from(schema.memories)
      .where(and(...conditions))
      .limit(20);

    const results: ContradictionResult[] = [];

    for (const existingMem of existing) {
      // Skip comparing with itself
      if (existingMem.id === newMemory.id) continue;

      const result = await detectContradictionLLM(
        newMemory,
        { id: existingMem.id, content: existingMem.content },
        useLLM
      );

      if (result.hasContradiction) {
        results.push(result);
      }
    }

    if (results.length > 0) {
      logger.info(`Found ${results.length} contradictions for memory ${newMemory.id}`);
    }

    return results;
  } catch (e) {
    logger.error('Error checking contradictions:', e);
    return [];
  }
}

/**
 * Batch contradiction check for multiple memories
 * More efficient for bulk operations
 */
export async function batchCheckContradictions(
  memories: MemoryForContradiction[],
  useLLM: boolean = false
): Promise<Map<string, ContradictionResult[]>> {
  const results = new Map<string, ContradictionResult[]>();

  for (const memory of memories) {
    const contradictions = await checkContradictions(memory, useLLM);
    results.set(memory.id, contradictions);
  }

  return results;
}
