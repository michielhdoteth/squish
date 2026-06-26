/**
 * Scope Filtering
 * Helpers for filtering memories by visibility scope and team membership.
 *
 * Two modes:
 *  1. buildScopeFilter - produces a filter object suitable for Drizzle DB queries
 *  2. filterMemoriesByScope - filters an in-memory array (for post-fetch filtering)
 */
import type { TeamMember, MemoryForAcl } from './types.js';
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
export declare function buildScopeFilter(member: TeamMember | null, projectId?: string): {
    visibilityScopes?: string[];
    projectId?: string;
    userId?: string | null;
};
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
export declare function filterMemoriesByScope<T extends MemoryForAcl>(memories: T[], member: TeamMember | null): T[];
//# sourceMappingURL=scope-filter.d.ts.map