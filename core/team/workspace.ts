/**
 * Team Workspace
 * CRUD operations for team members and membership checks.
 *
 * Uses the same DB access pattern as agent-memory.ts:
 *   getDb() + getSchema() with (db as any).insert/update/select.
 */

import { eq, and, isNull } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { getDb } from '../../db/index.js';
import { getSchema } from '../../db/schema.js';
import { logger } from '../logger.js';
import type { TeamMember, TeamRole, CreateTeamMemberInput } from './types.js';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Build a Drizzle `and(...)` filter for userId / agentId lookup. */
function memberFilter(
  schema: any,
  projectId: string,
  userId?: string,
  agentId?: string,
) {
  const conditions = [eq(schema.teamMembers.projectId, projectId)];
  if (userId !== undefined) {
    conditions.push(eq(schema.teamMembers.userId, userId));
  }
  if (agentId !== undefined) {
    conditions.push(eq(schema.teamMembers.agentId, agentId));
  }
  return and(...conditions);
}

/** Map a raw DB row to a TeamMember domain object. */
function mapRow(row: any): TeamMember {
  return {
    id: row.id,
    projectId: row.project_id,
    userId: row.user_id ?? null,
    agentId: row.agent_id ?? null,
    role: (row.role ?? 'member') as TeamRole,
    joinedAt: row.joined_at instanceof Date ? row.joined_at : new Date(row.joined_at),
    lastActiveAt: row.last_active_at ? (row.last_active_at instanceof Date ? row.last_active_at : new Date(row.last_active_at)) : null,
    metadata: row.metadata ?? null,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Add a member to a team.
 * Returns the newly created TeamMember.
 */
export async function createTeamMember(input: CreateTeamMemberInput): Promise<TeamMember> {
  try {
    const db = await getDb();
    const schema = await getSchema();

    const id = randomUUID();
    const role = input.role ?? 'member';

    await (db as any).insert(schema.teamMembers).values({
      id,
      projectId: input.projectId,
      userId: input.userId ?? null,
      agentId: input.agentId ?? null,
      role,
      joinedAt: new Date(),
      lastActiveAt: null,
      metadata: input.metadata ?? null,
    });

    const member: TeamMember = {
      id,
      projectId: input.projectId,
      userId: input.userId ?? null,
      agentId: input.agentId ?? null,
      role: role as TeamRole,
      joinedAt: new Date(),
      lastActiveAt: null,
      metadata: input.metadata ?? null,
    };

    logger.debug('Team member created', { id, projectId: input.projectId, role });
    return member;
  } catch (error) {
    logger.error('Error creating team member', error);
    throw error;
  }
}

/**
 * Get a specific team member by userId or agentId.
 * Returns null if no matching member is found.
 */
export async function getTeamMember(
  projectId: string,
  userId?: string,
  agentId?: string,
): Promise<TeamMember | null> {
  try {
    const db = await getDb();
    const schema = await getSchema();

    const where = memberFilter(schema, projectId, userId, agentId);
    const rows = await (db as any).select().from(schema.teamMembers).where(where).limit(1);

    if (!rows || rows.length === 0) return null;
    return mapRow(rows[0]);
  } catch (error) {
    logger.error('Error getting team member', error);
    throw error;
  }
}

/**
 * List all members of a team for a given project.
 */
export async function getTeamMembers(projectId: string): Promise<TeamMember[]> {
  try {
    const db = await getDb();
    const schema = await getSchema();

    const rows = await (db as any)
      .select()
      .from(schema.teamMembers)
      .where(eq(schema.teamMembers.projectId, projectId));

    return rows.map(mapRow);
  } catch (error) {
    logger.error('Error listing team members', error);
    throw error;
  }
}

/**
 * Remove a team member by userId or agentId.
 * No-op if the member does not exist.
 */
export async function removeTeamMember(
  projectId: string,
  userId?: string,
  agentId?: string,
): Promise<void> {
  try {
    const db = await getDb();
    const schema = await getSchema();

    const where = memberFilter(schema, projectId, userId, agentId);
    await (db as any).delete(schema.teamMembers).where(where);

    logger.debug('Team member removed', { projectId, userId, agentId });
  } catch (error) {
    logger.error('Error removing team member', error);
    throw error;
  }
}

/**
 * Update a member's role.
 * Returns the updated TeamMember.
 * @throws Error if the member is not found.
 */
export async function updateMemberRole(
  projectId: string,
  userId: string,
  role: TeamRole,
): Promise<TeamMember> {
  try {
    const db = await getDb();
    const schema = await getSchema();

    const where = and(
      eq(schema.teamMembers.projectId, projectId),
      eq(schema.teamMembers.userId, userId),
    );

    const rows = await (db as any).select().from(schema.teamMembers).where(where).limit(1);
    if (!rows || rows.length === 0) {
      throw new Error(`Team member not found: userId=${userId} in project=${projectId}`);
    }

    await (db as any).update(schema.teamMembers).set({ role }).where(where);

    const updated = { ...mapRow(rows[0]), role };
    logger.debug('Team member role updated', { projectId, userId, role });
    return updated;
  } catch (error) {
    logger.error('Error updating team member role', error);
    throw error;
  }
}

/**
 * Update the lastActiveAt timestamp for a team member.
 */
export async function updateLastActive(
  projectId: string,
  userId?: string,
  agentId?: string,
): Promise<void> {
  try {
    const db = await getDb();
    const schema = await getSchema();

    const where = memberFilter(schema, projectId, userId, agentId);
    await (db as any)
      .update(schema.teamMembers)
      .set({ lastActiveAt: new Date() })
      .where(where);
  } catch (error) {
    logger.error('Error updating last active', error);
    throw error;
  }
}

/**
 * Check whether a user or agent is a member of a team.
 */
export async function isTeamMember(
  projectId: string,
  userId?: string,
  agentId?: string,
): Promise<boolean> {
  const member = await getTeamMember(projectId, userId, agentId);
  return member !== null;
}

/**
 * Get the role of a user or agent within a team.
 * Returns null if not a member.
 */
export async function getMemberRole(
  projectId: string,
  userId?: string,
  agentId?: string,
): Promise<TeamRole | null> {
  const member = await getTeamMember(projectId, userId, agentId);
  return member?.role ?? null;
}
