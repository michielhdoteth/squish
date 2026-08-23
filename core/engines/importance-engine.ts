/**
 * Importance engine dispatch (P5)
 *
 * Wraps v1 (core/memory/importance.ts) and v2 (core/scoring/importance-v2.ts)
 * behind env flags. Shadow mode runs BOTH, logs disagreements, serves v1.
 */

import { calculateImportance, type ImportanceScore } from '../memory/importance.js';
import {
  calculateImportanceV2,
  normalizeImportanceScore,
  denormalizeImportanceScore,
  detectSurprise,
  detectEmotion,
} from '../scoring/importance-v2.js';
import { getImportanceEngine, isImportanceShadow } from './flags.js';
import { pushEngineLog } from './engine-log.js';

export function computeInitialImportance(memoryInput: {
  content: string;
  type: string;
  createdAt: string;
  accessCount: number;
  usageCount: number;
  isPinned: boolean;
  isProtected: boolean;
  isImmutable: boolean;
}): ImportanceScore {
  const v1Score = calculateImportance(memoryInput);
  const engine = getImportanceEngine();
  const shadow = isImportanceShadow();

  if (!shadow && engine === 'v1') {
    return v1Score;
  }

  let v2Score100: number;
  try {
    v2Score100 = denormalizeImportanceScore(
      calculateImportanceV2({
        baseImportance: normalizeImportanceScore(v1Score.score),
        surprise: detectSurprise({ content: memoryInput.content, type: memoryInput.type }, []),
        emotion: detectEmotion(memoryInput.content),
      })
    );
  } catch {
    return v1Score;
  }

  if (shadow) {
    if (Math.abs(v2Score100 - v1Score.score) >= 5) {
      pushEngineLog('importance_shadow_disagreement', {
        type: memoryInput.type,
        v1: v1Score.score,
        v2: v2Score100,
      });
    }
    return v1Score;
  }

  // v2 active
  return {
    ...v1Score,
    score: v2Score100,
    explanation: `importance-v2 (3-factor): base=${normalizeImportanceScore(v1Score.score).toFixed(3)}, emotion=${detectEmotion(memoryInput.content).toFixed(3)}, neutral surprise`,
  };
}
