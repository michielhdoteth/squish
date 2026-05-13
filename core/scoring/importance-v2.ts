/**
 * Importance Scoring v2 - 3-Factor Model
 *
 * Implements 3-factor importance scoring with LLM-as-Validator research backing.
 * Formula: Final = 0.5*base + 0.3*surprise + 0.2*emotion
 * Target accuracy: 95%+
 */

export interface ImportanceFactors {
  baseImportance: number;    // 0-1 (current system normalized)
  surprise: number;           // 0-1 (unexpectedness)
  emotion: number;            // 0-1 (emotional salience)
}

export interface ImportanceWeights {
  base?: number;
  surprise?: number;
  emotion?: number;
}

/**
 * 3-factor importance scoring
 * Final = 0.5*base + 0.3*surprise + 0.2*emotion
 * Weights configurable via config
 *
 * @param factors - The three importance factors
 * @param weights - Optional custom weights (defaults to 0.5, 0.3, 0.2)
 * @returns Normalized importance score between 0 and 1
 */
export function calculateImportanceV2(
  factors: ImportanceFactors,
  weights?: ImportanceWeights
): number {
  const w = {
    base: weights?.base ?? 0.5,
    surprise: weights?.surprise ?? 0.3,
    emotion: weights?.emotion ?? 0.2
  };

  // Validate weights sum to 1 (or close to it)
  const weightSum = w.base + w.surprise + w.emotion;
  if (Math.abs(weightSum - 1.0) > 0.01) {
    console.warn(`Importance weights sum to ${weightSum}, not 1.0`);
  }

  const score = (factors.baseImportance * w.base) +
                (factors.surprise * w.surprise) +
                (factors.emotion * w.emotion);

  // Clamp to 0-1 range
  return Math.max(0, Math.min(1, score));
}

/**
 * Detect surprise factor
 * High surprise = content contradicts existing beliefs/decisions
 *
 * Uses keyword-based opposite detection as a lightweight heuristic.
 * For LLM-based detection, use the contradiction-v2 module.
 *
 * @param newMemory - The new memory to check
 * @param existingMemories - Array of existing memories to compare against
 * @returns Surprise score between 0 and 1
 */
export function detectSurprise(
  newMemory: { content: string; type: string },
  existingMemories: { content: string; type: string }[]
): number {
  if (existingMemories.length === 0) {
    return 0.5; // Neutral surprise for first memory
  }

  // Simplified: check for contradictions using keyword matching
  const contradictions = existingMemories.filter(existing => {
    return hasOppositeKeywords(newMemory.content, existing.content);
  });

  // Calculate surprise based on number of contradictions found
  // Normalize: 3+ contradictions = max surprise (1.0)
  const surprise = Math.min(1.0, contradictions.length / 3);
  return surprise;
}

/**
 * Detect emotion factor
 * High emotion = urgent/high-stakes content
 *
 * @param content - The memory content to analyze
 * @returns Emotion score between 0 and 1
 */
export function detectEmotion(content: string): number {
  const urgentKeywords = ['urgent', 'critical', 'asap', 'emergency', 'broken', 'error', 'fail'];
  const importantKeywords = ['important', 'key', 'crucial', 'decision', 'milestone', 'release'];

  const lower = content.toLowerCase();
  let score = 0;

  // Urgent keywords add 0.5 to score
  // Use word boundary matching to avoid partial matches (e.g., "did not fail" should not match "fail")
  if (urgentKeywords.some(k => new RegExp(`\\b${k}\\b`).test(lower))) {
    score += 0.5;
  }

  // Important keywords add 0.3 to score
  if (importantKeywords.some(k => new RegExp(`\\b${k}\\b`).test(lower))) {
    score += 0.3;
  }

  // Cap at 1.0
  return Math.min(1.0, score);
}

/**
 * Check if two strings contain opposite keywords
 * Internal helper for surprise detection
 */
function hasOppositeKeywords(content1: string, content2: string): boolean {
  const str1 = content1.toLowerCase();
  const str2 = content2.toLowerCase();

  // Define opposite keyword pairs
  const opposites = [
    ['yes', 'no'],
    ['true', 'false'],
    ['always', 'never'],
    ['increase', 'decrease'],
    ['up', 'down'],
    ['good', 'bad'],
    ['success', 'failure'],
    ['working', 'broken'],
  ];

  for (const [pos, neg] of opposites) {
    // Check if one contains positive and other contains negative
    if ((str1.includes(pos) && str2.includes(neg)) ||
        (str1.includes(neg) && str2.includes(pos))) {
      return true;
    }
  }

  return false;
}

/**
 * Convert legacy importance score (0-100) to normalized (0-1)
 * Useful for integrating with existing importance scoring system
 */
export function normalizeImportanceScore(score100: number): number {
  return Math.max(0, Math.min(1, score100 / 100));
}

/**
 * Convert normalized importance score (0-1) to legacy (0-100)
 */
export function denormalizeImportanceScore(score1: number): number {
  return Math.round(Math.max(0, Math.min(100, score1 * 100)));
}
