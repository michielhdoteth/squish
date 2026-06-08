/**
 * Team Access Control (ACL)
 * Role-based and scope-based permission checks for memories.
 *
 * Visibility scope hierarchy (most restrictive to least):
 *   private -> project -> team -> global
 *
 * Owner and admin have full read/write across all scopes.
 * Members can read project, team, global scopes but only write to private.
 * Viewers can read project, team, global scopes but cannot write.
 */

import type { TeamMember, TeamRole, VisibilityScope, MemoryForAcl } from './types.js';
import { ROLE_PERMISSIONS } from './types.js';

// ---------------------------------------------------------------------------
// Permission checks
// ---------------------------------------------------------------------------

/**
 * Check if a team member can read a memory.
 *
 * Rules:
 *  - null member -> only global memories are readable (unauthenticated)
 *  - private: only the author (same userId) can read
 *  - project: anyone in the same project can read
 *  - team: anyone in the team can read
 *  - global: everyone can read
 *  - owner/admin bypass authorship check for private memories within their project
 */
export function canReadMemory(
  memory: MemoryForAcl,
  member: TeamMember | null,
): boolean {
  const scope = memory.visibilityScope as VisibilityScope;

  // Global is always readable
  if (scope === 'global') return true;

  // No member context: only global is readable
  if (!member) return false;

  // Owner and admin bypass: can read everything in their project
  if (member.role === 'owner' || member.role === 'admin') {
    // Still restrict to same project unless global
    if (scope === 'private' || scope === 'project' || scope === 'team') {
      if (memory.projectId && memory.projectId !== member.projectId) return false;
    }
    return true;
  }

  // Private: only the author can read
  if (scope === 'private') {
    if (memory.userId && memory.userId === member.userId) return true;
    if (memory.agentId && memory.agentId === member.agentId) return true;
    return false;
  }

  // Project scope: any member of the same project can read
  if (scope === 'project') {
    if (memory.projectId && memory.projectId !== member.projectId) return false;
    return true;
  }

  // Team scope: any member of the team can read
  if (scope === 'team') {
    if (memory.projectId && memory.projectId !== member.projectId) return false;
    return true;
  }

  return false;
}

/**
 * Check if a team member can write to a memory.
 *
 * Rules:
 *  - null member -> cannot write anything
 *  - owner/admin: can write everything in their project
 *  - member: can write to private scope (own memories only)
 *  - viewer: cannot write
 *  - The member must be the author (same userId/agentId) for private writes
 *    unless they are owner/admin
 */
export function canWriteMemory(
  memory: MemoryForAcl,
  member: TeamMember | null,
): boolean {
  const scope = memory.visibilityScope as VisibilityScope;

  // No member -> no write
  if (!member) return false;

  // Owner and admin: full write access within their project
  if (member.role === 'owner' || member.role === 'admin') {
    if (memory.projectId && memory.projectId !== member.projectId) return false;
    return true;
  }

  // Viewer: no write access
  if (member.role === 'viewer') return false;

  // Member: can only write to private scope and must be the author
  if (scope === 'private') {
    if (memory.userId && memory.userId === member.userId) return true;
    if (memory.agentId && memory.agentId === member.agentId) return true;
    return false;
  }

  // Members cannot write to project/team/global scopes
  return false;
}

// ---------------------------------------------------------------------------
// Scope helpers
// ---------------------------------------------------------------------------

/**
 * Get the list of visibility scopes a member can read.
 */
export function getReadableScopes(member: TeamMember | null): VisibilityScope[] {
  if (!member) return ['global'];

  const permissions = ROLE_PERMISSIONS[member.role];
  return permissions.read;
}

/**
 * Get the list of visibility scopes a member can write to.
 */
export function getWriteableScopes(member: TeamMember | null): VisibilityScope[] {
  if (!member) return [];

  const permissions = ROLE_PERMISSIONS[member.role];
  return permissions.write;
}
