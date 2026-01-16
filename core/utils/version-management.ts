/**
 * Shared Version Management Utilities
 * Common patterns for versioning and updating records
 */

import { eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { getDb } from '../../db/index.js';
import { getSchema } from '../../db/schema.js';

/**
 * Create a new version of a fact by expiring the old one
 */
export async function createNewFactVersion(
  oldFactId: string,
  newContent: string,
  additionalFields: Record<string, any> = {},
  reason?: string
): Promise<string> {
  try {
    const db = await getDb();
    const schema = await getSchema();

    // Get the old fact
    const oldFacts = await (db as any)
      .select()
      .from(schema.memories)
      .where(eq(schema.memories.id, oldFactId))
      .limit(1);

    if (oldFacts.length === 0) {
      throw new Error('Previous fact not found');
    }

    const oldFact = oldFacts[0];
    const now = new Date();
    const newFactId = randomUUID();

    // Expire the old fact
    await (db as any)
      .update(schema.memories)
      .set({ validTo: now, supersededBy: newFactId })
      .where(eq(schema.memories.id, oldFactId));

    // Create new version
    const newFact: any = {
      id: newFactId,
      type: 'fact',
      sector: 'semantic',
      content: newContent,
      confidence: oldFact.confidence,
      validFrom: now,
      validTo: null,
      version: (oldFact.version || 1) + 1,
      tags: oldFact.tags,
      projectId: oldFact.projectId,
      createdAt: now,
      updatedAt: now,
      ...additionalFields,
    };

    if (reason) {
      newFact.metadata = { supersedes: oldFactId, reason };
    }

    await (db as any).insert(schema.memories).values(newFact);

    return newFactId;
  } catch (error) {
    console.error('[squish] Error creating new fact version:', error);
    throw error;
  }
}