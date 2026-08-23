/**
 * Engine selection flags (P5)
 *
 * SQUISH_CONTRADICTION_ENGINE=v1|v2   (default v1)
 * SQUISH_CONTRADICTION_SHADOW=true    (run both, log disagreements, serve v1)
 * SQUISH_IMPORTANCE_ENGINE=v1|v2      (default v1)
 * SQUISH_IMPORTANCE_SHADOW=true       (run both, log disagreements, serve v1)
 * SQUISH_ACL_ENFORCE=true             (enforce ACL read gate; default log-only)
 */

export type EngineVersion = 'v1' | 'v2';

export function getContradictionEngine(): EngineVersion {
  return process.env.SQUISH_CONTRADICTION_ENGINE === 'v2' ? 'v2' : 'v1';
}

export function getImportanceEngine(): EngineVersion {
  return process.env.SQUISH_IMPORTANCE_ENGINE === 'v2' ? 'v2' : 'v1';
}

export function isContradictionShadow(): boolean {
  return process.env.SQUISH_CONTRADICTION_SHADOW === 'true';
}

export function isImportanceShadow(): boolean {
  return process.env.SQUISH_IMPORTANCE_SHADOW === 'true';
}

export function isAclEnforce(): boolean {
  return process.env.SQUISH_ACL_ENFORCE === 'true';
}
