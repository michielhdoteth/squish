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
export declare function ebbinghausRetention(params: DecayParams): number;
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
export declare function ebbinghausScore(currentScore: number, params: DecayParams): number;
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
export declare function getDefaultDecayParams(memoryType: string): DecayParams;
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
export declare function ebbinghausRetentionHours(tHours: number, tauHours?: number, beta?: number): number;
//# sourceMappingURL=ebbinghaus.d.ts.map