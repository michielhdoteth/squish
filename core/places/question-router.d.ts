/**
 * Question Router - Route questions to the most relevant place type
 *
 * Detects the type of question being asked and maps it to the appropriate
 * place type for the v1.5.0 multi-place routing system.
 */
import type { PlaceType } from './places.js';
export type QuestionType = 'temporal' | 'preference' | 'event' | 'factual' | 'idea' | 'active_work' | 'multi_hop' | 'global';
/**
 * Detect the type of question being asked
 */
export declare function detectQuestionType(query: string): QuestionType;
/**
 * Map question type to primary place type
 */
export declare function questionPlaceType(query: string): PlaceType;
//# sourceMappingURL=question-router.d.ts.map