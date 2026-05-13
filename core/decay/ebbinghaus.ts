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
 * @param memoryType - Type of memory
 * @returns Decay parameters with appropriate beta value
 */
export function getDefaultDecayParams(memoryType: string): DecayParams {
  const now = new Date();
  
  // Default tau (time constant) is 1.0 day for all types
  const tau = 1.0;
  
  // Beta values based on memory type research
  let beta: number;
  switch (memoryType.toLowerCase()) {
    case 'episodic':
      beta = 0.07;
      break;
    case 'semantic':
      beta = 0.02;
      break;
    case 'procedural':
      beta = 0.03;
      break;
    case 'self-model':
      beta = 0.01;
      break;
    case 'introspective':
      beta = 0.02;
      break;
    default:
      // Default beta from task specification
      beta = 0.3;
  }
  
  return {
    tau,
    beta,
    lastDecayAt: now,
    createdAt: now
  };
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
