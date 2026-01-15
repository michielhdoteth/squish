/**
 * MCP Tool: list_merge_proposals
 *
 * Lists pending merge proposals for user review
 */

import type { MemoryMergeProposal } from '../../../drizzle/schema';
import { createDatabaseClient, getDb } from '../../../db';
import { getSchema } from '../../../db/adapter';
import { eq, and, desc } from 'drizzle-orm';

interface ListProposalsInput {
  projectId: string;
  status?: 'pending' | 'approved' | 'rejected' | 'expired';
  limit?: number;
}

interface ProposalSummary {
  id: string;
  projectId: string;
  sourceMemoryIds: string[];
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  confidenceLevel: 'high' | 'medium' | 'low';
  similarityScore: number;
  mergeReason: string;
  createdAt: string;
  conflictWarnings: string[];
}

interface ListProposalsResponse {
  ok: boolean;
  message: string;
  data?: {
    projectId: string;
    count: number;
    proposals: ProposalSummary[];
    byStatus: {
      pending: number;
      approved: number;
      rejected: number;
      expired: number;
    };
  };
  error?: string;
}

/**
 * Handle list_merge_proposals tool call
 *
 * Lists merge proposals that are waiting for user review
 */
export async function handleListProposals(input: ListProposalsInput): Promise<ListProposalsResponse> {
  try {
    const { projectId, status, limit = 20 } = input;

    if (!projectId) {
      return {
        ok: false,
        message: 'projectId is required',
        error: 'projectId is required',
      };
    }

    const db = createDatabaseClient(await getDb());
    const schema = await getSchema();

    // Build query
    let query: any = db
      .select()
      .from(schema.memoryMergeProposals)
      .where(eq(schema.memoryMergeProposals.projectId, projectId));

    // Filter by status if specified
    if (status) {
      query = query.where(eq(schema.memoryMergeProposals.status, status));
    }

    // Order by creation date (newest first)
    query = query.orderBy(desc(schema.memoryMergeProposals.createdAt));

    // Limit results
    query = query.limit(limit);

    const proposals: MemoryMergeProposal[] = await query;

    // Count by status for the project
    const allProposals: MemoryMergeProposal[] = await db
      .select()
      .from(schema.memoryMergeProposals)
      .where(eq(schema.memoryMergeProposals.projectId, projectId));

    const byStatus = {
      pending: allProposals.filter((p) => p.status === 'pending').length,
      approved: allProposals.filter((p) => p.status === 'approved').length,
      rejected: allProposals.filter((p) => p.status === 'rejected').length,
      expired: allProposals.filter((p) => p.status === 'expired').length,
    };

    // Format proposals
    const formattedProposals: ProposalSummary[] = proposals.map((p) => ({
      id: p.id,
      projectId: p.projectId,
      sourceMemoryIds: (p.sourceMemoryIds as unknown as string[]) || [],
      status: (p.status as 'pending' | 'approved' | 'rejected' | 'expired') || 'pending',
      confidenceLevel: (p.confidenceLevel as 'high' | 'medium' | 'low') || 'medium',
      similarityScore: p.similarityScore || 0,
      mergeReason: p.mergeReason || '',
      createdAt: p.createdAt?.toISOString() || '',
      conflictWarnings: (p.conflictWarnings as unknown as string[]) || [],
    }));

    return {
      ok: true,
      message: `Found ${formattedProposals.length} proposals (${byStatus.pending} pending)`,
      data: {
        projectId,
        count: formattedProposals.length,
        proposals: formattedProposals,
        byStatus,
      },
    };
  } catch (error) {
    return {
      ok: false,
      message: 'Failed to list proposals',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
