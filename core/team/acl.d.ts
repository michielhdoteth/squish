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
import type { TeamMember, VisibilityScope, MemoryForAcl } from './types.js';
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
export declare function canReadMemory(memory: MemoryForAcl, member: TeamMember | null): boolean;
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
export declare function canWriteMemory(memory: MemoryForAcl, member: TeamMember | null): boolean;
/**
 * Get the list of visibility scopes a member can read.
 */
export declare function getReadableScopes(member: TeamMember | null): VisibilityScope[];
/**
 * Get the list of visibility scopes a member can write to.
 */
export declare function getWriteableScopes(member: TeamMember | null): VisibilityScope[];
//# sourceMappingURL=acl.d.ts.map