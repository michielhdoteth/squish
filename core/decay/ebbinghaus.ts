/**
 * Ebbinghaus Power-Law Decay Function
 * 
 * Implements the Ebbinghaus forgetting curve using power-law decay:
 * R(t) = (1 + t/τ)^(-β)
 * 
 * Where:
 * - R(t) = Retention probability at time t (0.0 to 1.0)
 * - t = Time elapsed since last decay (in days)
 * - τ (tau) = Time constant (default: 1.0 day, configurable per memory)
 * - β (beta) = Decay exponent (default: 0.3, configurable per memory)
 * 
 * Biological basis: The Ebbinghaus forgetting curve describes how memory retention
 * decays over time. Power-law decay more accurately models human memory than linear decay.
 * 
 * Reference: Squish v2.0 Architecture Design, Section 7 - Decay Function
 */

/**
 * Shared NULL/invalid decay_rate fallback, aligned across the decay engine and
 * the ranking-side retention mirror (Batch 6b fix): both use the engine's
 * value, tau = 1 day.
 */
export const DEFAULT_TAU_DAYS = 1.0;

/**
 * Parameters for Ebbinghaus decay calculation
 */
export interface DecayParams {
  /** Time constant in days (default: 1.0) */
  tau: number;
  /** Decay rate (default: 0.3) */
  beta: number;
  /** When decay was last applied */
  lastDecayAt: Date;
  /** When the memory was created */
  createdAt: Date;
}

/**
 * Calculate retention using Ebbinghaus power-law decay
 * 
 * @param params - Decay parameters
 * @returns Retention value between 0 and 1
 * 
 * @example
 * // 100% retention at t=0
 * ebbinghausRetention({ tau: 1.0, beta: 0.3, lastDecayAt: new Date(), createdAt: new Date() })
 * // ~0.78 retention after 1 day with tau=1, beta=0.3
 */
export function ebbinghausRetention(params: DecayParams): number {
  const t = daysSinceLastDecay(params.lastDecayAt);
  
  // R(t) = (1 + t/τ)^(-β)
  const retention = Math.pow(1 + t / params.tau, -params.beta);
  
  // Clamp to [0, 1] for safety (though mathematically should already be in this range)
  return Math.max(0, Math.min(1, retention));
}

/**
 * Calculate decayed score by applying retention to current score
 * 
 * @param currentScore - Current memory score (0-100 or 0-1 depending on system)
 * @param params - Decay parameters
 * @returns Decayed score
 * 
 * @example
 * // If memory has score 100 and retention is 0.8, returns 80
 * ebbinghausScore(100, { tau: 1.0, beta: 0.3, lastDecayAt: pastDate, createdAt: pastDate })
 */
export function ebbinghausScore(currentScore: number, params: DecayParams): number {
  const retention = ebbinghausRetention(params);
  return currentScore * retention;
}

/**
 * Calculate days since last decay was applied
 * 
 * @param lastDecayAt - Date when decay was last applied
 * @returns Number of days elapsed (can be fractional)
 */
function daysSinceLastDecay(lastDecayAt: Date): number {
  const now = Date.now();
  const lastDecay = new Date(lastDecayAt).getTime();
  const msPerDay = 1000 * 60 * 60 * 24;
  return (now - lastDecay) / msPerDay;
}

/**
 * Get default decay parameters for a given memory type
 *
 * Based on research from Squish v2.0 architecture:
 * - episodic: β=0.07 (slow decay)
 * - semantic: β=0.02 (very slow)
 * - procedural: β=0.03 (slow)
 * - self-model: β=0.01 (very slow)
 * - introspective: β=0.02 (slow)
 *
 * Batch 6b: the REAL write-path type vocabulary (observation/fact/decision/
 * context/preference/note/task) is mapped onto Ebbinghaus tier classes
 * (fleeting/working/long-term/sturdy equivalents) instead of falling through
 * to the old one-size default β=0.3, which decayed everything far too fast.
 *
 * @param memoryType - Type of memory
 * @returns Decay parameters with appropriate beta value
 */
export function getDefaultDecayParams(memoryType: string): DecayParams {
  const now = new Date();

  return {
    tau: DEFAULT_TAU_DAYS,
    beta: betaForMemoryType(memoryType),
    lastDecayAt: now,
    createdAt: now
  };
}

/**
 * Map the real memory-type vocabulary onto Ebbinghaus decay-tier betas
 * (Batch 6b). Documented mapping:
 *
 *   fleeting-equivalent  observation, note          β = 0.10 (fast decay)
 *   working-equivalent   task, context, session     β = 0.05
 *   long-term-equivalent fact                        β = 0.02
 *   sturdy-equivalent    decision, preference       β = 0.01 (near-stable)
 *
 * Sector names (episodic/semantic/procedural/...) keep their original values.
 * Unknown types default to the working-equivalent β=0.05 rather than the old
 * blanket 0.3 so unclassified rows no longer evaporate.
 */
export function betaForMemoryType(memoryType?: string | null): number {
  switch ((memoryType ?? '').toLowerCase()) {
    // Real write-path vocabulary -> tier-class equivalents
    case 'observation':
    case 'note':
      return 0.10; // fleeting-equivalent
    case 'task':
    case 'context':
    case 'session':
      return 0.05; // working-equivalent
    case 'fact':
      return 0.02; // long-term-equivalent
    case 'decision':
    case 'preference':
      return 0.01; // sturdy-equivalent

    // Sector vocabulary (kept from v2.0 architecture research)
    case 'episodic':
      return 0.07;
    case 'semantic':
      return 0.02;
    case 'procedural':
      return 0.03;
    case 'self-model':
      return 0.01;
    case 'introspective':
      return 0.02;

    default:
      return 0.05; // working-equivalent default (was 0.3 pre-Batch-6b)
  }
}

/**
 * Calculate retention using hours instead of days (alternative version)
 * 
 * From architecture document: t is in hours, tau default is 24 hours
 * 
 * @param tHours - Time elapsed in hours
 * @param tauHours - Time constant in hours (default: 24)
 * @param beta - Decay exponent (default: 0.5)
 * @returns Retention value between 0 and 1
 */
export function ebbinghausRetentionHours(
  tHours: number,
  tauHours: number = 24,
  beta: number = 0.5
): number {
  // R(t) = (1 + t/τ)^(-β)
  const retention = Math.pow(1 + tHours / tauHours, -beta);
  
  // Clamp to [0, 1]
  return Math.max(0, Math.min(1, retention));
}
