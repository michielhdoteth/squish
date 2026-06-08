/**
 * Scope Filtering
 * Helpers for filtering memories by visibility scope and team membership.
 *
 * Two modes:
 *  1. buildScopeFilter - produces a filter object suitable for Drizzle DB queries
 *  2. filterMemoriesByScope - filters an in-memory array (for post-fetch filtering)
 */

import type { TeamMember, VisibilityScope, MemoryForAcl } from './types.js';
import { getReadableScopes } from './acl.js';

// ---------------------------------------------------------------------------
// DB-level filter builder
// ---------------------------------------------------------------------------

/**
 * Build a filter object that can be spread into a Drizzle where clause.
 *
 * When a member is provided:
 *   - Owner/admin: no filtering (they can see everything in their project)
 *   - Member/viewer: restrict to readable scopes
 *
 * When no member is provided:
 *   - Only global memories are visible
 *
 * The returned object has optional keys so it can be merged into existing
 * query conditions without overwriting project/user filters.
 */
export function buildScopeFilter(
  member: TeamMember | null,
  projectId?: string,
): {
  visibilityScopes?: string[];
  projectId?: string;
  userId?: string | null;
} {
  const readable = getReadableScopes(member);

  // When member is null, only allow global
  if (!member) {
    return {
      visibilityScopes: ['global'],
      projectId,
    };
  }

  // Owner and admin: no scope restriction needed at the DB level
  // (ACL will still validate per-memory, but for bulk queries we let them through)
  if (member.role === 'owner' || member.role === 'admin') {
    return {
      projectId: projectId ?? member.projectId,
    };
  }

  // For members/viewers: restrict to readable scopes
  return {
    visibilityScopes: readable,
    projectId: projectId ?? member.projectId,
  };
}

// ---------------------------------------------------------------------------
// In-memory filter
// ---------------------------------------------------------------------------

/**
 * Filter a list of memories in-memory by what the given member can read.
 *
 * Use this when the memories have already been fetched and you need to
 * do a second pass of filtering (e.g., after a union of queries or when
 * the DB query couldn't encode the full ACL logic).
 *
 * Each memory is checked against canReadMemory-style rules inline for
 * performance (avoids re-importing acl.ts to keep the dependency tree flat).
 */
export function filterMemoriesByScope<T extends MemoryForAcl>(
  memories: T[],
  member: TeamMember | null,
): T[] {
  if (!member) {
    // Unauthenticated: only global
    return memories.filter((m) => m.visibilityScope === 'global');
  }

  // Owner/admin: no filtering within their project
  if (member.role === 'owner' || member.role === 'admin') {
    return memories.filter((m) => {
      // Still filter by project for non-global scopes
      if (m.visibilityScope !== 'global' && m.projectId && m.projectId !== member.projectId) {
        return false;
      }
      return true;
    });
  }

  const readable = getReadableScopes(member);

  return memories.filter((m) => {
    const scope = m.visibilityScope as VisibilityScope;

    // Check scope is in the readable set
    if (!readable.includes(scope)) return false;

    // Private: only the author
    if (scope === 'private') {
      if (m.userId && m.userId === member.userId) return true;
      if (m.agentId && m.agentId === member.agentId) return true;
      return false;
    }

    // Project: must be same project
    if (scope === 'project') {
      if (m.projectId && m.projectId !== member.projectId) return false;
      return true;
    }

    // Team: must be same project
    if (scope === 'team') {
      if (m.projectId && m.projectId !== member.projectId) return false;
      return true;
    }

    // Global: always readable (already in readable set)
    return true;
  });
}
