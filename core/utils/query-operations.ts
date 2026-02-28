/**
 * Shared Requirements Query Operations
 * Common patterns for database queries with error handling
 */

import { and } from 'drizzle-orm';
import { getDb } from '../../db/index.js';
import { getSchema } from '../../db/schema.js';

export class MemoryRequirementError extends Error {
  constructor(
    message: string,
    public readonly missingCriteria: any,
    public readonly context?: any
  ) {
    super(message);
    this.name = 'MemoryRequirementError';
    Object.setPrototypeOf(this, MemoryRequirementError.prototype);
  }
}

/**
 * Execute a memory requirement query with standard error handling
 */
export async function executeMemoryQuery(
  criteria: any,
  filters: any[],
  limit: number = 1,
  operation: string = 'memory requirement'
): Promise<any[]> {
  try {
    const db = await getDb();
    const schema = await getSchema();

    const query = filters.length > 0 ? and(...filters) : undefined;

    const memories = await (db as any)
      .select()
      .from(schema.memories)
      .where(query)
      .limit(limit);

    return memories;
  } catch (error) {
    if (error instanceof MemoryRequirementError) {
      throw error;
    }
    const msg = error instanceof Error ? error.message : String(error);
    throw new MemoryRequirementError(`Error checking ${operation}: ${msg}`, criteria);
  }
}

/**
 * Execute a memory assertion query (expecting specific results)
 */
export async function executeMemoryAssertion(
  criteria: any,
  filters: any[],
  expectedCount: number,
  operation: string,
  errorMessage: string
): Promise<any[]> {
  try {
    const memories = await executeMemoryQuery(criteria, filters, 100, operation);

    if (expectedCount === 0 && memories.length > 0) {
      throw new MemoryRequirementError(errorMessage, criteria, { found: memories[0].id });
    }

    if (expectedCount > 0 && memories.length < expectedCount) {
      const msg = `Required ${expectedCount} memories but found ${memories.length}`;
      throw new MemoryRequirementError(msg, criteria, { found: memories.length, required: expectedCount });
    }

    return memories;
  } catch (error) {
    if (error instanceof MemoryRequirementError) {
      throw error;
    }
    const msg = error instanceof Error ? error.message : String(error);
    throw new MemoryRequirementError(`Error ${operation}: ${msg}`, criteria);
  }
}