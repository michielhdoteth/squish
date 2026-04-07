/**
 * Local/String-based Judge
 * 
 * Simple evaluation without API calls - uses string matching and heuristics
 * Good for quick testing without API costs
 */

import type { Judge, EvaluationResult } from '../types/index.js';

export class LocalJudge implements Judge {
  name = 'local';

  async evaluate(answer: string, groundTruth: string, question: string): Promise<EvaluationResult> {
    const answerLower = answer.toLowerCase();
    const truthLower = groundTruth.toLowerCase();
    
    // Extract key terms from ground truth (words longer than 4 chars)
    const keyTerms = truthLower
      .split(/\s+/)
      .filter(word => word.length > 4)
      .map(word => word.replace(/[^a-z0-9]/g, ''))
      .filter(word => word.length > 0);
    
    // Count matching terms
    let matches = 0;
    for (const term of keyTerms) {
      if (answerLower.includes(term)) {
        matches++;
      }
    }
    
    // Calculate score based on term matches
    const matchRatio = keyTerms.length > 0 ? matches / keyTerms.length : 0;
    
    // Check for exact answer containment (either direction)
    const containsAnswer = truthLower.includes(answerLower) || answerLower.includes(truthLower);
    
    // Determine correctness - either good term match or containment
    const isCorrect = matchRatio >= 0.5 || containsAnswer;
    
    return {
      correct: isCorrect,
      score: Math.max(matchRatio, containsAnswer ? 0.8 : 0),
      confidence: 0.7,
      reasoning: `Matched ${matches}/${keyTerms.length} key terms. ${isCorrect ? 'Sufficient match.' : 'Insufficient match.'}`,
    };
  }
}

export function createLocalJudge(): LocalJudge {
  return new LocalJudge();
}
