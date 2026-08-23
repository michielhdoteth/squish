/**
 * Contradiction engine dispatch (P5)
 *
 * Wraps v1 (core/memory/contradiction-resolver.ts) and
 * v2 (core/consolidation/contradiction-v2.ts) behind env flags.
 * Shadow mode runs BOTH, logs disagreements, serves v1's answer.
 */

import { resolveContradictions } from '../memory/contradiction-resolver.js';
import { checkContradictions } from '../consolidation/contradiction-v2.js';
import { getContradictionEngine, isContradictionShadow } from './flags.js';
import { pushEngineLog } from './engine-log.js';
import { createHash } from 'node:crypto';

export interface ContradictionResolution {
  supersededIds: string[];
  confidence: number;
  reason: string;
  associationType?: 'updates' | 'supersedes';
}

function digestInput(content: string, type: string): string {
  return createHash('sha256').update(`${type}:${content}`).digest('hex').slice(0, 16);
}

export async function runContradictionResolution(args: {
  content: string;
  type: string;
  projectId?: string | null;
  newMemoryId?: string;
  newMemoryCreatedAt?: string;
}): Promise<ContradictionResolution> {
  const engine = getContradictionEngine();
  const shadow = isContradictionShadow();

  if (!shadow && engine === 'v1') {
    return resolveContradictions(
      args.content,
      args.type,
      args.projectId ?? undefined,
      args.newMemoryId,
      args.newMemoryCreatedAt
    );
  }

  // v2 detection (also used in shadow mode)
  let v2Result: Awaited<ReturnType<typeof checkContradictions>> = [];
  try {
    v2Result = await checkContradictions({
      id: args.newMemoryId ?? 'new',
      content: args.content,
      projectId: args.projectId ?? undefined,
    });
  } catch {
    v2Result = [];
  }

  if (!shadow && engine === 'v2') {
    // v2 does not yet emit contradicted memory ids, so supersession is not
    // performed; findings are surfaced via the structured log.
    if (v2Result.length > 0) {
      pushEngineLog('contradiction_shadow_disagreement', {
        mode: 'engine-v2',
        digest: digestInput(args.content, args.type),
        v1: null,
        v2: { found: true, count: v2Result.length },
      });
    }
    return {
      supersededIds: [],
      confidence: v2Result.length > 0 ? Math.max(...v2Result.map((r) => r.confidence)) : 1,
      reason:
        v2Result.length > 0
          ? `v2 detected ${v2Result.length} contradiction(s): ${v2Result[0].reason}`
          : 'No contradictions detected (v2)',
    };
  }

  // Shadow mode: serve v1's answer, log disagreements
  const v1Result = await resolveContradictions(
    args.content,
    args.type,
    args.projectId ?? undefined,
    args.newMemoryId,
    args.newMemoryCreatedAt
  );

  const v1Found = v1Result.supersededIds.length > 0;
  const v2Found = v2Result.length > 0;
  if (v1Found !== v2Found) {
    pushEngineLog('contradiction_shadow_disagreement', {
      mode: 'shadow',
      digest: digestInput(args.content, args.type),
      v1: { found: v1Found, count: v1Result.supersededIds.length, confidence: v1Result.confidence },
      v2: { found: v2Found, count: v2Result.length },
    });
  }

  return v1Result;
}
