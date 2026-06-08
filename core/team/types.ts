/**
 * Team Memory Types
 * Types for team workspaces, access control, and scope filtering.
 */

export type TeamRole = 'owner' | 'admin' | 'member' | 'viewer';

export type VisibilityScope = 'private' | 'project' | 'team' | 'global';

export interface TeamMember {
  id: string;
  projectId: string;
  userId: string | null;
  agentId: string | null;
  role: TeamRole;
  joinedAt: Date;
  lastActiveAt: Date | null;
  metadata: Record<string, unknown> | null;
}

export interface CreateTeamMemberInput {
  projectId: string;
  userId?: string;
  agentId?: string;
  role?: TeamRole;
  metadata?: Record<string, unknown>;
}

/**
 * Minimal memory shape needed for ACL checks.
 * Avoids coupling to the full Drizzle Memory type.
 */
export interface MemoryForAcl {
  visibilityScope: string;
  userId?: string | null;
  projectId?: string | null;
  agentId?: string | null;
}

/**
 * Role-based permission matrix.
 * Maps each role to the set of scopes it can read and write.
 */
export const ROLE_PERMISSIONS: Record<TeamRole, { read: VisibilityScope[]; write: VisibilityScope[] }> = {
  owner:  { read: ['private', 'project', 'team', 'global'], write: ['private', 'project', 'team', 'global'] },
  admin:  { read: ['private', 'project', 'team', 'global'], write: ['private', 'project', 'team', 'global'] },
  member: { read: ['project', 'team', 'global'],            write: ['private'] },
  viewer: { read: ['project', 'team', 'global'],            write: [] },
};
