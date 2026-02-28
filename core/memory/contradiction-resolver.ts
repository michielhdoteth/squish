/**
 * Contradiction Resolver
 * Detects and auto-resolves contradictions when writing new memories
 * Implements supersession logic for outdated information
 */

import { eq, and, inArray } from 'drizzle-orm';
import { getDb } from '../../db/index.js';
import { getSchema } from '../../db/schema.js';
import { logger } from '../logger.js';
import { createAssociation } from '../associations.js';

export interface ContradictionResult {
  hasContradiction: boolean;
  supersededMemories: string[];
  confidence: number;
  reason: string;
}

export interface ContradictionCheck {
  newContent: string;
  newType: string;
  projectId?: string;
  entities?: string[];
}

// Patterns that indicate updated/corrected information
const UPDATE_PATTERNS = [
  /\b(now|currently|actually|in fact|correct(ed)?|update(d)?)\b/gi,
  /\b(changed to|switched to|moved to)\b/gi,
  /\b(formerly|previously|used to be)\b/gi,
  /\binstead of\b/gi,
  /\b(no longer|not anymore)\b/gi,
];

// Negation patterns
const NEGATION_PATTERNS = [
  /\b(not|no|never|don't|doesn't|didn't|won't|wouldn't|shouldn't|can't|cannot)\b/gi,
];

// Key entity extraction for contradiction detection
function extractKeyEntities(content: string): string[] {
  // Simple extraction of capitalized phrases and key terms
  const entities: string[] = [];
  
  // Match capitalized multi-word phrases (likely proper nouns)
  const properNouns = content.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b/g) || [];
  entities.push(...properNouns);
  
  // Match quoted strings (often important values)
  const quoted = content.match(/"([^"]+)"|'([^']+)'/g) || [];
  entities.push(...quoted.map(q => q.replace(/['"]/g, '')));
  
  // Match key-value patterns
  const keyValues = content.match(/(\w+)\s*[=:]\s*(\S+)/g) || [];
  entities.push(...keyValues);
  
  return [...new Set(entities)];
}

// Calculate content similarity (Jaccard on words)
function calculateSimilarity(a: string, b: string): number {
  const tokensA = new Set(a.toLowerCase().split(/\s+/).filter(t => t.length > 2));
  const tokensB = new Set(b.toLowerCase().split(/\s+/).filter(t => t.length > 2));
  
  const intersection = new Set([...tokensA].filter(x => tokensB.has(x)));
  const union = new Set([...tokensA, ...tokensB]);
  
  return union.size > 0 ? intersection.size / union.size : 0;
}

// Check if content has negation
function hasNegation(content: string): boolean {
  return NEGATION_PATTERNS.some(pattern => pattern.test(content));
}

// Check if content indicates an update
function hasUpdateIndicator(content: string): boolean {
  return UPDATE_PATTERNS.some(pattern => pattern.test(content));
}

// Extract the "subject" of a memory (what it's about)
function extractSubject(content: string): string {
  // Take first significant clause
  const sentences = content.split(/[.!?\n]/);
  const firstSentence = sentences[0]?.trim() || content;
  
  // Limit to first 100 chars for subject matching
  return firstSentence.substring(0, 100).toLowerCase();
}

/**
 * Detect contradictions between new memory and existing memories
 */
export async function detectContradictions(check: ContradictionCheck): Promise<ContradictionResult> {
  const result: ContradictionResult = {
    hasContradiction: false,
    supersededMemories: [],
    confidence: 0,
    reason: '',
  };

  try {
    const db = await getDb();
    const schema = await getSchema();
    
    // Get memories from same project with similar content
    const whereClause = check.projectId
      ? eq(schema.memories.projectId, check.projectId)
      : undefined;
    
    const existingMemories = await (db as any)
      .select()
      .from(schema.memories)
      .where(whereClause)
      .limit(100);
    
    if (existingMemories.length === 0) {
      return result;
    }
    
    const newSubject = extractSubject(check.newContent);
    const newEntities = extractKeyEntities(check.newContent);
    const newHasNegation = hasNegation(check.newContent);
    const newHasUpdate = hasUpdateIndicator(check.newContent);
    
    const toSupersede: string[] = [];
    let maxConfidence = 0;
    let reasons: string[] = [];
    
    for (const existing of existingMemories) {
      // Skip already superseded memories
      if (existing.status === 'superseded' || existing.status === 'merged') {
        continue;
      }
      
      // Skip protected memories
      if (existing.isProtected) {
        continue;
      }
      
      const existingSubject = extractSubject(existing.content);
      const similarity = calculateSimilarity(check.newContent, existing.content);
      const subjectSimilarity = calculateSimilarity(newSubject, existingSubject);
      
      // Check for entity overlap
      const existingEntities = extractKeyEntities(existing.content);
      const entityOverlap = newEntities.filter(e => 
        existingEntities.some(ee => ee.toLowerCase().includes(e.toLowerCase()) || 
                                    e.toLowerCase().includes(ee.toLowerCase()))
      );
      
      // Detect contradiction scenarios
      
      // Scenario 1: High similarity with negation in new content
      if (similarity > 0.5 && newHasNegation && subjectSimilarity > 0.4) {
        toSupersede.push(existing.id);
        maxConfidence = Math.max(maxConfidence, similarity * 0.9);
        reasons.push(`negation of similar content (${(similarity * 100).toFixed(0)}% similar)`);
        continue;
      }
      
      // Scenario 2: Update indicator with overlapping subject
      if (newHasUpdate && subjectSimilarity > 0.5) {
        toSupersede.push(existing.id);
        maxConfidence = Math.max(maxConfidence, subjectSimilarity * 0.85);
        reasons.push(`update to existing information`);
        continue;
      }
      
      // Scenario 3: Same type, high subject similarity, different conclusion
      if (existing.type === check.newType && subjectSimilarity > 0.6) {
        // Check if conclusions differ
        const existingHasNegation = hasNegation(existing.content);
        
        // XOR: one has negation, other doesn't
        if (newHasNegation !== existingHasNegation) {
          toSupersede.push(existing.id);
          maxConfidence = Math.max(maxConfidence, subjectSimilarity * 0.8);
          reasons.push(`contradicting statement about same topic`);
          continue;
        }
      }
      
      // Scenario 4: Entity overlap with correction signals
      if (entityOverlap.length >= 2 && similarity > 0.3) {
        const correctionSignals = /\b(fixed|changed|updated|replaced|removed|added)\b/i.test(check.newContent);
        if (correctionSignals) {
          toSupersede.push(existing.id);
          maxConfidence = Math.max(maxConfidence, 0.75);
          reasons.push(`correction involving ${entityOverlap.slice(0, 2).join(', ')}`);
          continue;
        }
      }
      
      // Scenario 5: Very high similarity (near-duplicate) - supersede older
      if (similarity > 0.85) {
        toSupersede.push(existing.id);
        maxConfidence = Math.max(maxConfidence, similarity);
        reasons.push(`near-duplicate replacement`);
        continue;
      }
    }
    
    if (toSupersede.length > 0) {
      result.hasContradiction = true;
      result.supersededMemories = [...new Set(toSupersede)]; // Dedupe
      result.confidence = maxConfidence;
      result.reason = reasons[0] || 'contradiction detected';
    }
    
  } catch (error) {
    logger.error('Error detecting contradictions', error);
  }
  
  return result;
}

/**
 * Apply supersession to memories - archive old ones and create associations
 */
export async function applySupersession(
  newMemoryId: string,
  supersededIds: string[],
  confidence: number
): Promise<void> {
  if (supersededIds.length === 0) return;
  
  try {
    const db = await getDb();
    const schema = await getSchema();
    const now = new Date();
    
    // Update superseded memories
    await (db as any)
      .update(schema.memories)
      .set({
        status: 'superseded',
        supersededBy: newMemoryId,
        supersededAt: now,
        updatedAt: now,
      })
      .where(inArray(schema.memories.id, supersededIds));
    
    // Create associations for traceability
    for (const oldId of supersededIds) {
      await createAssociation(newMemoryId, oldId, 'supersedes', confidence);
    }
    
    logger.info('Applied supersession', {
      newMemoryId,
      supersededCount: supersededIds.length,
      confidence,
    });
    
  } catch (error) {
    logger.error('Error applying supersession', error);
  }
}

/**
 * Check for temporal contradictions (facts that are no longer valid)
 */
export async function checkTemporalContradictions(
  content: string,
  projectId?: string
): Promise<string[]> {
  const supersededIds: string[] = [];
  
  try {
    // Look for temporal update patterns
    const temporalUpdates = content.match(
      /\b(as of|starting|beginning|from now|effective)\s+(\d{4}|\w+\s+\d{1,2})/gi
    );
    
    if (!temporalUpdates || temporalUpdates.length === 0) {
      return supersededIds;
    }
    
    const db = await getDb();
    const schema = await getSchema();
    
    // Find memories with overlapping subject but older validTo dates
    const subject = extractSubject(content);
    
    const whereClause = projectId
      ? and(
          eq(schema.memories.projectId, projectId),
          eq(schema.memories.status, 'active')
        )
      : eq(schema.memories.status, 'active');
    
    const candidates = await (db as any)
      .select()
      .from(schema.memories)
      .where(whereClause)
      .limit(50);
    
    for (const candidate of candidates) {
      const candidateSubject = extractSubject(candidate.content);
      const similarity = calculateSimilarity(subject, candidateSubject);
      
      if (similarity > 0.5 && candidate.validTo) {
        const validToDate = new Date(candidate.validTo);
        const now = new Date();
        
        // If the candidate's validity period has passed
        if (validToDate < now) {
          supersededIds.push(candidate.id);
        }
      }
    }
    
  } catch (error) {
    logger.error('Error checking temporal contradictions', error);
  }
  
  return supersededIds;
}

/**
 * Integrated contradiction resolution for the write path
 * Call this before storing a new memory
 */
export async function resolveContradictions(
  content: string,
  type: string,
  projectId?: string
): Promise<{
  shouldProceed: boolean;
  supersededIds: string[];
  confidence: number;
  reason: string;
}> {
  // Detect standard contradictions
  const contradictionResult = await detectContradictions({
    newContent: content,
    newType: type,
    projectId,
  });
  
  // Also check temporal contradictions
  const temporalSuperseded = await checkTemporalContradictions(content, projectId);
  
  // Combine results
  const allSuperseded = [
    ...new Set([
      ...contradictionResult.supersededMemories,
      ...temporalSuperseded,
    ]),
  ];
  
  const maxConfidence = Math.max(
    contradictionResult.confidence,
    temporalSuperseded.length > 0 ? 0.7 : 0
  );
  
  return {
    shouldProceed: true, // Always proceed, but track supersessions
    supersededIds: allSuperseded,
    confidence: maxConfidence,
    reason: contradictionResult.reason || 
            (temporalSuperseded.length > 0 ? 'temporal supersession' : ''),
  };
}
