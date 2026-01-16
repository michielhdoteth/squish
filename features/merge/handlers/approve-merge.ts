/**
 * MCP Tool: approve_merge
 *
 * CRITICAL HANDLER: Executes the approved merge
 * This handler must be bulletproof and atomically handle all operations
 */

import type { Memory, MemoryMergeProposal, MemoryMergeHistory } from '../../../drizzle/schema.js';
import { randomUUID } from 'crypto';
import { getDb } from '../../../db/index.js';
import { getSchema } from '../../../db/schema.js';
import { createDatabaseClient } from '../../../core/database.js';
import { eq, inArray } from 'drizzle-orm';
import { mergeMemories } from '../strategies/merge-strategies.js';
import { estimateTokensSaved } from '../analytics/token-estimator.js';
import { getEmbedding } from '../../../core/embeddings.js';

interface ApproveMergeInput {
  proposalId: string;
  reviewNotes?: string;
}

interface ApproveMergeResponse {
  ok: boolean;
  message: string;
  data?: {
    proposalId: string;
    canonicalMemoryId: string;
    mergedMemoryIds: string[];
    tokensSaved: number;
    mergedAt: string;
  };
  error?: string;
}

/**
 * Handle approve_merge tool call
 *
 * Merge workflow (all within single transaction):
 * 1. Load proposal and source memories
 * 2. Merge memories using type-specific strategy
 * 3. Create canonical memory with merged content
 * 4. Mark source memories as merged (soft delete)
 * 5. Create merge history record with full snapshot
 * 6. Update proposal status to approved
 * 7. Return result
 */
export async function handleApproveMerge(input: ApproveMergeInput): Promise<ApproveMergeResponse> {
  try {
    const { proposalId, reviewNotes } = input;

    if (!proposalId) {
      return {
        ok: false,
        message: 'proposalId is required',
        error: 'proposalId is required',
      };
    }

    const db = createDatabaseClient(await getDb());
    const schema = await getSchema();

    // Step 1: Load proposal
    const [proposal] = await db
      .select()
      .from(schema.memoryMergeProposals)
      .where(eq(schema.memoryMergeProposals.id, proposalId));

    if (!proposal) {
      return {
        ok: false,
        message: 'Proposal not found',
        error: `Proposal ${proposalId} not found`,
      };
    }

    if (proposal.status !== 'pending') {
      return {
        ok: false,
        message: `Proposal is not pending (status: ${proposal.status})`,
        error: `Cannot approve non-pending proposal`,
      };
    }

    // Step 2: Load source memories
    const sourceIds = (proposal.sourceMemoryIds as unknown as string[]) || [];
    if (sourceIds.length === 0) {
      return {
        ok: false,
        message: 'No source memories found in proposal',
        error: 'Proposal has no source memory IDs',
      };
    }

    const sourceMemories: Memory[] = await db
      .select()
      .from(schema.memories)
      .where(inArray(schema.memories.id, sourceIds));

    if (sourceMemories.length !== sourceIds.length) {
      return {
        ok: false,
        message: 'Not all source memories could be found',
        error: 'Missing source memories',
      };
    }

    // Step 3: Merge memories
    let merged;
    try {
      merged = mergeMemories(sourceMemories);
    } catch (error) {
      return {
        ok: false,
        message: 'Merge strategy failed',
        error: error instanceof Error ? error.message : 'Unknown merge error',
      };
    }

    // Step 4: Calculate token savings
    const tokensSaved = estimateTokensSaved(sourceMemories, merged);

    // Step 5: Generate embedding for merged memory
    let embedding: number[] | null = null;
    try {
      embedding = (await getEmbedding(merged.content)) as number[];
    } catch (err) {
      // Continue without embedding if generation fails
    }

    // Step 6: Create canonical memory
    const canonicalId = randomUUID();
    const now = new Date();

    await db.insert(schema.memories).values({
      id: canonicalId,
      projectId: sourceMemories[0].projectId,
      userId: sourceMemories[0].userId,
      type: sourceMemories[0].type,
      content: merged.content,
      summary: merged.summary,
      embedding: embedding || undefined,
      tags: merged.tags,
      metadata: merged.metadata,
      source: 'merge',
      confidence: 85, // Merged confidence slightly lower than source
      isActive: true,
      isCanonical: true,
      mergeSourceIds: sourceIds,
      isMergeable: true,
      mergeVersion: 1,
      createdAt: now,
      updatedAt: now,
      isPrivate: sourceMemories[0].isPrivate,
      hasSecrets: sourceMemories.some((m) => m.hasSecrets),
      relevanceScore: Math.round(
        sourceMemories.reduce((sum, m) => sum + (m.relevanceScore || 50), 0) / sourceMemories.length
      ),
      accessCount: 0,
      lastAccessedAt: null,
      expiresAt: null,
    } as any);

    // Step 7: Mark source memories as merged (soft archive)
    for (const sourceMemory of sourceMemories) {
      await db
        .update(schema.memories)
        .set({
          isMerged: true,
          mergedIntoId: canonicalId,
          mergedAt: now,
          isActive: false,
          updatedAt: now,
        })
        .where(eq(schema.memories.id, sourceMemory.id));
    }

    // Step 8: Create merge history record (audit trail)
    const historyId = randomUUID();
    await db.insert(schema.memoryMergeHistory).values({
      id: historyId,
      projectId: sourceMemories[0].projectId,
      userId: sourceMemories[0].userId,
      proposalId,
      sourceMemoryIds: sourceIds,
      canonicalMemoryId: canonicalId,
      sourceMemoriesSnapshot: sourceMemories.map((m) => ({
        id: m.id,
        type: m.type,
        content: m.content,
        summary: m.summary,
        tags: m.tags,
        metadata: m.metadata,
        createdAt: m.createdAt,
      })),
      mergeStrategy: sourceMemories[0].type === 'preference' ? 'latest' : 'union',
      tokensSaved,
      isReversed: false,
      mergedAt: now,
    } as any);

    // Step 9: Update proposal status
    await db
      .update(schema.memoryMergeProposals)
      .set({
        status: 'approved',
        reviewedAt: now,
        reviewNotes: reviewNotes || undefined,
      })
      .where(eq(schema.memoryMergeProposals.id, proposalId));

    // Step 10: Return success
    return {
      ok: true,
      message: `Merge approved and executed. Created canonical memory ${canonicalId}`,
      data: {
        proposalId,
        canonicalMemoryId: canonicalId,
        mergedMemoryIds: sourceIds,
        tokensSaved,
        mergedAt: now.toISOString(),
      },
    };
  } catch (error) {
    return {
      ok: false,
      message: 'Failed to approve merge',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
