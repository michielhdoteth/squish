/**
 * ACL (Access Control List) for squish-memory
 * Role-based access control for teams and memory sharing
 */
import { eq, and } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { getDb } from '../db/index.js';
import { getSchema } from '../db/schema.js';
import { createDatabaseClient } from './storage/database.js';

// ============================================================================
// Types
// ============================================================================

export type Permission = 'read' | 'write';
export type TeamRole = 'owner' | 'admin' | 'member';

export interface Team {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface TeamMember {
  id: string;
  teamId: string;
  userId: string;
  role: TeamRole;
  joinedAt: Date;
}

export interface TeamShare {
  id: string;
  memoryId: string;
  teamId: string;
  sharedBy: string;
  permission: Permission;
  createdAt: Date;
}

export interface AclResult {
  allowed: boolean;
  reason?: string;
}

// ============================================================================
// Errors
// ============================================================================

export class AclError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AclError';
  }
}

export class ForbiddenError extends AclError {
  constructor(message: string = 'Insufficient permissions') {
    super(message);
    this.name = 'ForbiddenError';
  }
}

export class TeamNotFoundError extends AclError {
  constructor(teamId: string) {
    super(`Team not found: ${teamId}`);
    this.name = 'TeamNotFoundError';
  }
}

export class MemberNotFoundError extends AclError {
  constructor(userId: string, teamId: string) {
    super(`User ${userId} is not a member of team ${teamId}`);
    this.name = 'MemberNotFoundError';
  }
}

// ============================================================================
// Constants
// ============================================================================

const ROLE_HIERARCHY: Record<TeamRole, number> = {
  owner: 3,
  admin: 2,
  member: 1,
};

const PERMISSION_LEVELS: Record<Permission, number> = {
  read: 1,
  write: 2,
};

// ============================================================================
// Database Access
// ============================================================================

async function getDbInstance() {
  return createDatabaseClient(await getDb());
}

async function getSchemaInstance() {
  return await getSchema();
}

// ============================================================================
// Team Operations
// ============================================================================

/**
 * Get all teams for a user
 */
export async function getUserTeams(userId: string): Promise<Team[]> {
  const db = await getDbInstance();
  const schema = await getSchemaInstance();

  const results = await db
    .select({
      team: schema.teams,
    })
    .from(schema.team_members)
    .innerJoin(schema.teams, eq(schema.team_members.teamId, schema.teams.id))
    .where(eq(schema.team_members.userId, userId));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return results.map((r: any) => r.team);
}

/**
 * Check if user is a member of a team
 */
export async function isTeamMember(userId: string, teamId: string): Promise<boolean> {
  const db = await getDbInstance();
  const schema = await getSchemaInstance();

  const result = await db
    .select({ id: schema.team_members.id })
    .from(schema.team_members)
    .where(
      and(
        eq(schema.team_members.userId, userId),
        eq(schema.team_members.teamId, teamId)
      )
    )
    .limit(1);

  return result.length > 0;
}

/**
 * Get user's role in a team
 */
export async function getUserTeamRole(userId: string, teamId: string): Promise<TeamRole | null> {
  const db = await getDbInstance();
  const schema = await getSchemaInstance();

  const result = await db
    .select({ role: schema.team_members.role })
    .from(schema.team_members)
    .where(
      and(
        eq(schema.team_members.userId, userId),
        eq(schema.team_members.teamId, teamId)
      )
    )
    .limit(1);

  if (result.length === 0) return null;
  return result[0].role as TeamRole;
}

/**
 * Check if user has required role level
 */
export async function hasTeamRole(
  userId: string,
  teamId: string,
  requiredRole: TeamRole
): Promise<AclResult> {
  const userRole = await getUserTeamRole(userId, teamId);

  if (!userRole) {
    return { allowed: false, reason: 'User is not a team member' };
  }

  const userLevel = ROLE_HIERARCHY[userRole];
  const requiredLevel = ROLE_HIERARCHY[requiredRole];

  if (userLevel >= requiredLevel) {
    return { allowed: true };
  }

  return {
    allowed: false,
    reason: `Required role: ${requiredRole}, user role: ${userRole}`,
  };
}

// ============================================================================
// Permission Checking
// ============================================================================

/**
 * Check if user can access a memory via team membership
 */
export async function canAccessMemory(
  userId: string,
  memoryId: string,
  requiredPermission: Permission = 'read'
): Promise<AclResult> {
  const db = await getDbInstance();
  const schema = await getSchemaInstance();

  // Get memory to find owner
  const memoryResult = await db
    .select({ userId: schema.memories.userId })
    .from(schema.memories)
    .where(eq(schema.memories.id, memoryId))
    .limit(1);

  if (memoryResult.length === 0) {
    return { allowed: false, reason: 'Memory not found' };
  }

  // Owner always has full access
  if (memoryResult[0].userId === userId) {
    return { allowed: true };
  }

  // Check team shares
  const shares = await db
    .select({
      teamId: schema.team_shares.teamId,
      permission: schema.team_shares.permission,
    })
    .from(schema.team_shares)
    .where(eq(schema.team_shares.memoryId, memoryId));

  // Check if user is a member of any team with sufficient permission
  for (const share of shares) {
    const isMember = await isTeamMember(userId, share.teamId);
    if (isMember) {
      const shareLevel = PERMISSION_LEVELS[share.permission as Permission];
      const requiredLevel = PERMISSION_LEVELS[requiredPermission];

      if (shareLevel >= requiredLevel) {
        return { allowed: true };
      }
    }
  }

  return {
    allowed: false,
    reason: 'No team access to this memory',
  };
}

/**
 * Check if user can modify team settings
 */
export async function canModifyTeam(
  userId: string,
  teamId: string
): Promise<AclResult> {
  return hasTeamRole(userId, teamId, 'admin');
}

/**
 * Check if user can delete team
 */
export async function canDeleteTeam(
  userId: string,
  teamId: string
): Promise<AclResult> {
  return hasTeamRole(userId, teamId, 'owner');
}

/**
 * Check if user can invite members
 */
export async function canInviteMembers(
  userId: string,
  teamId: string
): Promise<AclResult> {
  return hasTeamRole(userId, teamId, 'admin');
}

/**
 * Check if user can remove members
 */
export async function canRemoveMember(
  userId: string,
  teamId: string,
  targetUserId: string
): Promise<AclResult> {
  // Owners can remove anyone
  const ownerCheck = await hasTeamRole(userId, teamId, 'owner');
  if (ownerCheck.allowed) return ownerCheck;

  // Admins can remove non-owners
  const adminCheck = await hasTeamRole(userId, teamId, 'admin');
  if (adminCheck.allowed) {
    const targetRole = await getUserTeamRole(targetUserId, teamId);
    if (targetRole === 'owner') {
      return { allowed: false, reason: 'Cannot remove team owner' };
    }
    return adminCheck;
  }

  return { allowed: false, reason: 'Insufficient permissions' };
}

/**
 * Check if user can share a memory with a team
 */
export async function canShareMemory(
  userId: string,
  memoryId: string
): Promise<AclResult> {
  const db = await getDbInstance();
  const schema = await getSchemaInstance();

  // Get memory to check ownership
  const memoryResult = await db
    .select({ userId: schema.memories.userId })
    .from(schema.memories)
    .where(eq(schema.memories.id, memoryId))
    .limit(1);

  if (memoryResult.length === 0) {
    return { allowed: false, reason: 'Memory not found' };
  }

  // Owner can share
  if (memoryResult[0].userId === userId) {
    return { allowed: true };
  }

  // Check if user has write access via team share
  const shares = await db
    .select({ teamId: schema.team_shares.teamId })
    .from(schema.team_shares)
    .where(eq(schema.team_shares.memoryId, memoryId));

  for (const share of shares) {
    const role = await getUserTeamRole(userId, share.teamId);
    if (role === 'owner' || role === 'admin') {
      return { allowed: true };
    }
  }

  return { allowed: false, reason: 'Only memory owner or team admin can share' };
}

// ============================================================================
// Team Management
// ============================================================================

/**
 * Create a new team
 */
export async function createTeam(
  name: string,
  slug: string,
  description?: string,
  ownerId?: string
): Promise<Team> {
  const db = await getDbInstance();
  const schema = await getSchemaInstance();

  const teamId = randomUUID();
  const now = new Date();

  await db.insert(schema.teams).values({
    id: teamId,
    name,
    slug,
    description,
    createdAt: now,
    updatedAt: now,
  });

  // Add owner if provided
  if (ownerId) {
    await db.insert(schema.team_members).values({
      id: randomUUID(),
      teamId,
      userId: ownerId,
      role: 'owner',
      joinedAt: now,
    });
  }

  return {
    id: teamId,
    name,
    slug,
    description,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Add member to team
 */
export async function addTeamMember(
  teamId: string,
  userId: string,
  role: TeamRole = 'member'
): Promise<TeamMember> {
  const db = await getDbInstance();
  const schema = await getSchemaInstance();

  const memberId = randomUUID();
  const now = new Date();

  await db.insert(schema.team_members).values({
    id: memberId,
    teamId,
    userId,
    role,
    joinedAt: now,
  });

  return {
    id: memberId,
    teamId,
    userId,
    role,
    joinedAt: now,
  };
}

/**
 * Remove member from team
 */
export async function removeTeamMember(
  teamId: string,
  userId: string
): Promise<void> {
  const db = await getDbInstance();
  const schema = await getSchemaInstance();

  await db
    .delete(schema.team_members)
    .where(
      and(
        eq(schema.team_members.teamId, teamId),
        eq(schema.team_members.userId, userId)
      )
    );
}

/**
 * Share memory with team
 */
export async function shareMemoryWithTeam(
  memoryId: string,
  teamId: string,
  sharedBy: string,
  permission: Permission = 'read'
): Promise<TeamShare> {
  const db = await getDbInstance();
  const schema = await getSchemaInstance();

  const shareId = randomUUID();
  const now = new Date();

  await db.insert(schema.team_shares).values({
    id: shareId,
    memoryId,
    teamId,
    sharedBy,
    permission,
    createdAt: now,
  });

  return {
    id: shareId,
    memoryId,
    teamId,
    sharedBy,
    permission,
    createdAt: now,
  };
}

/**
 * Revoke team share
 */
export async function revokeTeamShare(
  memoryId: string,
  teamId: string
): Promise<void> {
  const db = await getDbInstance();
  const schema = await getSchemaInstance();

  await db
    .delete(schema.team_shares)
    .where(
      and(
        eq(schema.team_shares.memoryId, memoryId),
        eq(schema.team_shares.teamId, teamId)
      )
    );
}

/**
 * Get all teams with access to a memory
 */
export async function getMemoryTeams(memoryId: string): Promise<TeamShare[]> {
  const db = await getDbInstance();
  const schema = await getSchemaInstance();

  return await db
    .select()
    .from(schema.team_shares)
    .where(eq(schema.team_shares.memoryId, memoryId));
}

/**
 * Get all members of a team
 */
export async function getTeamMembers(teamId: string): Promise<TeamMember[]> {
  const db = await getDbInstance();
  const schema = await getSchemaInstance();

  return await db
    .select()
    .from(schema.team_members)
    .where(eq(schema.team_members.teamId, teamId));
}
