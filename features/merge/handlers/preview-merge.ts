/**
 * MCP Tool: preview_merge
 *
 * Shows a preview of what the merged result will look like
 * without actually executing the merge
 */

import type { Memory, MemoryMergeProposal } from '../../../drizzle/schema';
import { createDatabaseClient, getDb } from '../../../db';
import { getSchema } from '../../../db/adapter';
import { eq } from 'drizzle-orm';
import { estimateMergeSavingsPreview } from '../analytics/token-estimator';
import { mergeMemories } from '../strategies/merge-strategies';

interface PreviewMergeInput {
  proposalId: string;
}

interface PreviewMergeResponse {
  ok: boolean;
  message: string;
  data?: {
    proposalId: string;
    sourceMemories: Array<{
      id: string;
      type: string;
      content: string;
      summary: string | null;
      tags: string[];
      createdAt: string;
    }>;
    mergedResult: {
      content: string;
      summary: string | null;
      tags: string[];
      metadata: Record<string, unknown>;
    };
    analysis: {
      mergeReason: string;
      conflictWarnings: string[];
      savedTokens: number;
      savedPercentage: number;
      similarityScore: number;
      confidenceLevel: string;
    };
  };
  error?: string;
}

/**
 * Handle preview_merge tool call
 *
 * Shows side-by-side comparison and merged result
 */
export async function handlePreviewMerge(input: PreviewMergeInput): Promise<PreviewMergeResponse> {
  try {
    const { proposalId } = input;

    if (!proposalId) {
      return {
        ok: false,
        message: 'proposalId is required',
        error: 'proposalId is required',
      };
    }

    const db = createDatabaseClient(await getDb());
    const schema = await getSchema();

    // Load proposal
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

    // Load source memories
    const sourceIds = (proposal.sourceMemoryIds as unknown as string[]) || [];
    const sourceMemories: Memory[] = [];

    for (const id of sourceIds) {
      const [memory] = await db.select().from(schema.memories).where(eq(schema.memories.id, id));
      if (memory) {
        sourceMemories.push(memory);
      }
    }

    if (sourceMemories.length === 0) {
      return {
        ok: false,
        message: 'No source memories found',
        error: 'Could not load source memories',
      };
    }

    // Regenerate merged result from source memories (should match proposal)
    const merged = mergeMemories(sourceMemories);

    // Calculate token savings
    const savings = estimateMergeSavingsPreview(sourceMemories, merged);

    // Format response
    return {
      ok: true,
      message: 'Merge preview generated',
      data: {
        proposalId,
        sourceMemories: sourceMemories.map((m) => ({
          id: m.id,
          type: m.type,
          content: m.content,
          summary: m.summary,
          tags: m.tags || [],
          createdAt: m.createdAt?.toISOString() || '',
        })),
        mergedResult: {
          content: merged.content,
          summary: merged.summary,
          tags: merged.tags,
          metadata: merged.metadata,
        },
        analysis: {
          mergeReason: merged.mergeReason,
          conflictWarnings: merged.conflictWarnings,
          savedTokens: savings.savedTokens,
          savedPercentage: savings.savedPercentage,
          similarityScore: proposal.similarityScore || 0,
          confidenceLevel: proposal.confidenceLevel || 'unknown',
        },
      },
    };
  } catch (error) {
    return {
      ok: false,
      message: 'Failed to preview merge',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
