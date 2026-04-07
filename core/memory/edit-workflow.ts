import { randomUUID } from 'crypto';
import { eq, and, sql } from 'drizzle-orm';
import { getDb } from '../../db/index.js';
import { getSchema } from '../../db/schema.js';
import { createDatabaseClient } from '../storage/database.js';
import { MemoryRecord } from './memories.js';
import { Conflict } from './conflict-detector.js';

export interface EditProposal {
  id: string;
  memoryId: string;
  currentContent: string;
  proposedContent: string;
  reason: string;
  conflictWarnings: string[];
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  version: number;
  createdAt: Date;
  reviewedAt?: Date;
  reviewNotes?: string;
}

export async function createEditProposal(
  memoryId: string,
  currentContent: string,
  proposedContent: string,
  reason: string,
  userId?: string
): Promise<EditProposal> {
  const db = createDatabaseClient(await getDb());
  const schema = await getSchema();
  const { memoryEditProposals } = schema;

  const proposalId = randomUUID();
  const now = new Date();

  await db.insert(memoryEditProposals).values({
    id: proposalId,
    memoryId,
    currentContent,
    proposedContent,
    reason,
    conflictWarnings: [],
    status: 'pending',
    version: 1,
    createdAt: now,
    userId,
  });

  // Run conflict detection
  const conflicts = await detectConflicts(memoryId, proposedContent);
  await db.update(memoryEditProposals)
    .set({ conflictWarnings: conflicts })
    .where(eq(memoryEditProposals.id, proposalId));

  return {
    id: proposalId,
    memoryId,
    currentContent,
    proposedContent,
    reason,
    conflictWarnings: conflicts,
    status: 'pending',
    version: 1,
    createdAt: now,
  };
}

export async function approveEditProposal(proposalId: string): Promise<boolean> {
  const db = createDatabaseClient(await getDb());
  const schema = await getSchema();
  const { memoryEditProposals, memories } = schema;

  // Get proposal
  const proposal = await db.select()
    .from(memoryEditProposals)
    .where(eq(memoryEditProposals.id, proposalId))
    .limit(1);

  if (proposal.length === 0) return false;

  // Update memory content
  await db.update(memories)
    .set({
      content: proposal[0].proposedContent,
      version: sql`${memories.version} + 1`,
      updatedAt: new Date()
    })
    .where(eq(memories.id, proposal[0].memoryId));

  // Mark proposal as approved
  await db.update(memoryEditProposals)
    .set({ status: 'approved', reviewedAt: new Date() })
    .where(eq(memoryEditProposals.id, proposalId));

  return true;
}

export async function rejectEditProposal(proposalId: string, reviewNotes: string): Promise<boolean> {
  const db = createDatabaseClient(await getDb());
  const schema = await getSchema();
  const { memoryEditProposals } = schema;

  await db.update(memoryEditProposals)
    .set({ status: 'rejected', reviewNotes, reviewedAt: new Date() })
    .where(eq(memoryEditProposals.id, proposalId));

  return true;
}

export async function detectConflicts(memoryId: string, proposedContent: string): Promise<string[]> {
  const db = createDatabaseClient(await getDb());
  const schema = await getSchema();
  const { memories } = schema;

  // Get current memory
  const currentMemory = await db.select()
    .from(memories)
    .where(eq(memories.id, memoryId))
    .limit(1);

  if (currentMemory.length === 0) return [];

  const conflicts: string[] = [];

  // Check for temporal contradictions
  if (currentMemory[0].validFrom && currentMemory[0].validTo) {
    const now = new Date();
    if (now < new Date(currentMemory[0].validFrom) || now > new Date(currentMemory[0].validTo)) {
      conflicts.push('Current time is outside validity period');
    }
  }

  // Check for semantic contradictions with other memories
  const similarMemories = await db.select()
    .from(memories)
    .where(
      and(
        eq(memories.projectId, currentMemory[0].projectId),
        sql`memories.id != ${memoryId}`,
        sql`memories.content ILIKE ${proposedContent}`
      )
    )
    .limit(5);

  for (const memory of similarMemories) {
    if (memory.id !== memoryId) {
      conflicts.push(`Potential contradiction with memory ${memory.id}`);
    }
  }

  return conflicts;
}

export async function getEditProposals(
  memoryId?: string,
  status?: 'pending' | 'approved' | 'rejected'
): Promise<EditProposal[]> {
  const db = createDatabaseClient(await getDb());
  const schema = await getSchema();
  const { memoryEditProposals } = schema;

  let query = db.select().from(memoryEditProposals);

  if (memoryId) {
    query = query.where(eq(memoryEditProposals.memoryId, memoryId));
  }
  if (status) {
    query = query.where(eq(memoryEditProposals.status, status));
  }

  const proposals = await query;
  return proposals as EditProposal[];
}