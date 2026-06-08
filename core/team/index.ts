/**
 * Team Memory - barrel export
 *
 * Re-exports all public types and functions from the team workspace modules.
 */

export type { TeamRole, VisibilityScope, TeamMember, CreateTeamMemberInput, MemoryForAcl } from './types.js';
export { ROLE_PERMISSIONS } from './types.js';

export {
  createTeamMember,
  getTeamMember,
  getTeamMembers,
  removeTeamMember,
  updateMemberRole,
  updateLastActive,
  isTeamMember,
  getMemberRole,
} from './workspace.js';

export {
  canReadMemory,
  canWriteMemory,
  getReadableScopes,
  getWriteableScopes,
} from './acl.js';

export {
  buildScopeFilter,
  filterMemoriesByScope,
} from './scope-filter.js';
