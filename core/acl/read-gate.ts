/**
 * ACL read gate (P5)
 *
 * Consults loadout visibility rules on retrieval/read paths.
 * Default (SQUISH_ACL_ENFORCE unset/false): LOG-ONLY - records what would
 * have been filtered into the bounded structured log and serves everything.
 * SQUISH_ACL_ENFORCE=true: actually filters disallowed results.
 *
 * Cheap by design: only activates when an ACL context with a userId is
 * supplied, and memories without any visibility rules are always served.
 */

import { checkVisibility, getVisibilityRules, hasVisibilityRules } from '../loadout/loadout.js';
import { isAclEnforce } from '../engines/flags.js';
import { pushEngineLog } from '../engines/engine-log.js';

export interface AclContext {
  userId: string;
  teamIds?: string[];
}

/**
 * Build an ACL context automatically for search paths that were not given one
 * explicitly. Cheap by design: returns null (no gating, zero per-result cost)
 * unless at least one visibility rule exists for memories. The userId falls
 * back to 'local-agent' when no explicit user is on the input.
 */
export async function buildAutoAclContext(userId?: string | null): Promise<AclContext | null> {
  try {
    if (!(await hasVisibilityRules('memory'))) {
      return null;
    }
  } catch {
    // Rule table unavailable -> fail open, no gating
    return null;
  }
  return { userId: userId ?? 'local-agent' };
}

export async function applyAclReadGate<T extends { id?: string }>(
  results: T[],
  ctx?: AclContext | null
): Promise<T[]> {
  if (!ctx || !ctx.userId || results.length === 0) {
    return results;
  }

  const enforce = isAclEnforce();
  const teamIds = ctx.teamIds ?? [];
  const kept: T[] = [];

  for (const result of results) {
    const memoryId = String(result.id ?? '');
    if (!memoryId) {
      kept.push(result);
      continue;
    }

    // Fast skip: no rules for this memory -> serve without DB permission walk
    const rules = await getVisibilityRules('memory', memoryId);
    if (rules.length === 0) {
      kept.push(result);
      continue;
    }

    const verdict = await checkVisibility('memory', memoryId, ctx.userId, teamIds);
    if (verdict.allowed) {
      kept.push(result);
    } else if (enforce) {
      // filtered out
    } else {
      pushEngineLog('acl_would_filter', {
        memoryId,
        rule: rules.map((r) => `${r.granteeType}:${r.granteeId}`).join(','),
      });
      kept.push(result);
    }
  }

  return kept;
}
