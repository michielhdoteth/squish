/**
 * Question Router - Route questions to the most relevant place type
 * 
 * Detects the type of question being asked and maps it to the appropriate
 * place type for the v1.5.0 multi-place routing system.
 */

import type { PlaceType } from './places.js';

export type QuestionType = 
  | 'temporal'       // "when did...", "last week..."
  | 'preference'     // "what do I prefer...", "what should we use..."
  | 'event'          // "what happened...", "what did we do..."
  | 'factual'        // "what is...", "what are the rules..."
  | 'idea'           // "what if...", "could we..."
  | 'active_work'    // "what are we building...", "current status..."
  | 'multi_hop'      // "across sessions...", "in the conversation..."
  | 'global';        // fallback

/**
 * Detect the type of question being asked
 */
export function detectQuestionType(query: string): QuestionType {
  const lower = query.toLowerCase();
  
  // Multi-hop (check early to catch "across sessions...what did" patterns)
  if (/\b(across sessions|between sessions|conversation|dialogue|session)\b/.test(lower)) {
    return 'multi_hop';
  }
  
  // Event (check before temporal to catch "what did...yesterday" patterns)
  if (/\b(what happened|what did|event|activity|task|completed)\b/.test(lower)) {
    return 'event';
  }
  
  // Temporal
  if (/\b(when|how long|ago|since|before|after|last week|last month|yesterday|tomorrow)\b/.test(lower)) {
    return 'temporal';
  }
  
  // Preference/opinion
  if (/\b(prefer|should we|best approach|recommend|opinion|like to|want to)\b/.test(lower)) {
    return 'preference';
  }
  
  // Active work
  if (/\b(current|status|building|working on|progress|latest|now)\b/.test(lower)) {
    return 'active_work';
  }
  
  // Idea/future
  if (/\b(what if|could we|maybe|idea|explore|future|consider|possibility)\b/.test(lower)) {
    return 'idea';
  }
  
  // Factual
  if (/\b(what is|what are|rule|policy|decision|decided|architecture)\b/.test(lower)) {
    return 'factual';
  }
  
  return 'global';
}

/**
 * Map question type to primary place type
 */
export function questionPlaceType(query: string): PlaceType {
  const qType = detectQuestionType(query);
  
  const mapping: Record<QuestionType, PlaceType> = {
    temporal: 'ref',
    preference: 'board',
    event: 'wip',
    factual: 'ref',
    idea: 'sparks',
    active_work: 'wip',
    multi_hop: 'inbox',  // inbox = search everywhere
    global: 'inbox',
  };
  
  return mapping[qType];
}