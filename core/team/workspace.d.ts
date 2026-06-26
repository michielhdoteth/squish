/**
 * Team Workspace
 * CRUD operations for team members and membership checks.
 *
 * Uses the same DB access pattern as agent-memory.ts:
 *   getDb() + getSchema() with (db as any).insert/update/select.
 */
import type { TeamMember, TeamRole, CreateTeamMemberInput } from './types.js';
/**
 * Add a member to a team.
 * Returns the newly created TeamMember.
 */
export declare function createTeamMember(input: CreateTeamMemberInput): Promise<TeamMember>;
/**
 * Get a specific team member by userId or agentId.
 * Returns null if no matching member is found.
 */
export declare function getTeamMember(projectId: string, userId?: string, agentId?: string): Promise<TeamMember | null>;
/**
 * List all members of a team for a given project.
 */
export declare function getTeamMembers(projectId: string): Promise<TeamMember[]>;
/**
 * Remove a team member by userId or agentId.
 * No-op if the member does not exist.
 */
export declare function removeTeamMember(projectId: string, userId?: string, agentId?: string): Promise<void>;
/**
 * Update a member's role.
 * Returns the updated TeamMember.
 * @throws Error if the member is not found.
 */
export declare function updateMemberRole(projectId: string, userId: string, role: TeamRole): Promise<TeamMember>;
/**
 * Update the lastActiveAt timestamp for a team member.
 */
export declare function updateLastActive(projectId: string, userId?: string, agentId?: string): Promise<void>;
/**
 * Check whether a user or agent is a member of a team.
 */
export declare function isTeamMember(projectId: string, userId?: string, agentId?: string): Promise<boolean>;
/**
 * Get the role of a user or agent within a team.
 * Returns null if not a member.
 */
export declare function getMemberRole(projectId: string, userId?: string, agentId?: string): Promise<TeamRole | null>;
//# sourceMappingURL=workspace.d.ts.map