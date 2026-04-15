/**
 * Reference Resolver
 * 
 * Resolves pronouns and references in queries to specific entities
 * using session context. Enables queries like:
 * "Was her project affected?" -> "Was Alice's project affected?"
 */

import { trackEntityInSession, resolveReference, getActiveSessionEntities } from './entity-tracker.js';
import { extractEntitiesAndRelations } from '../graph/llm-entity-extractor.js';
import { logger } from '../logger.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ReferenceResolution {
  original: string;
  resolved: string;
  resolvedEntity: string | null;
  entityType: string | null;
  confidence: number;
  method: 'pronoun' | 'definite_reference' | 'name_match' | 'none';
}

// ─── Pronoun Patterns ─────────────────────────────────────────────────────────

const PRONOUNS = new Set([
  'he', 'him', 'his', 'she', 'her', 'hers',
  'it', 'its', 'they', 'them', 'their', 'theirs',
  'this', 'that', 'these', 'those',
]);

const POSSESSIVE_PRONOUNS = new Set([
  'his', 'her', 'hers', 'its', 'their', 'theirs', 'my', 'your', 'our',
]);

// ─── Main Resolution Function ────────────────────────────────────────────────

/**
 * Resolve pronouns and references in a query using session context.
 * Returns the original query with pronouns replaced by entity names.
 */
export async function resolvePronouns(
  query: string,
  sessionId: string
): Promise<ReferenceResolution> {
  const words = query.split(/\s+/);
  let resolved = query;
  let bestResolution: ReferenceResolution = {
    original: query,
    resolved: query,
    resolvedEntity: null,
    entityType: null,
    confidence: 0,
    method: 'none',
  };

  // Step 1: Extract entities from the query itself
  const extraction = await extractEntitiesAndRelations(query, { preferLLM: false });
  for (const entity of extraction.entities) {
    trackEntityInSession(sessionId, entity.name, entity.name, entity.type);
  }

  // Step 2: Check each word for pronouns
  for (let i = 0; i < words.length; i++) {
    const word = words[i].toLowerCase().replace(/[.,!?;:]/g, '');

    if (PRONOUNS.has(word)) {
      const entity = resolveReference(sessionId, words[i]);
      if (entity) {
        // Replace the pronoun with the entity name
        const originalWord = words[i];
        words[i] = entity.entityName;
        resolved = words.join(' ');

        bestResolution = {
          original: query,
          resolved,
          resolvedEntity: entity.entityName,
          entityType: entity.entityType,
          confidence: entity.salience,
          method: 'pronoun',
        };

        logger.debug('Resolved pronoun', {
          pronoun: originalWord,
          entity: entity.entityName,
          type: entity.entityType,
          salience: entity.salience,
        });
      }
    }
  }

  // Step 3: Check for definite references ("the project", "the database")
  if (bestResolution.method === 'none') {
    const definiteRefPatterns = [
      { pattern: /\bthe (project|app|application)\b/i, types: ['concept'] },
      { pattern: /\bthe (team|group)\b/i, types: ['concept'] },
      { pattern: /\bthe (database|db)\b/i, types: ['tool'] },
      { pattern: /\bthe (server|service|api)\b/i, types: ['tool'] },
      { pattern: /\bthe (issue|bug|problem|outage)\b/i, types: ['concept'] },
      { pattern: /\bthe (file|module|component)\b/i, types: ['file'] },
    ];

    for (const { pattern, types } of definiteRefPatterns) {
      if (pattern.test(query)) {
        const entity = resolveReference(sessionId, query.match(pattern)![0]);
        if (entity) {
          // Replace "the X" with "the X (EntityName)"
          resolved = query.replace(pattern, `$1 (${entity.entityName})`);

          bestResolution = {
            original: query,
            resolved,
            resolvedEntity: entity.entityName,
            entityType: entity.entityType,
            confidence: entity.salience * 0.9, // Slightly lower confidence than direct pronoun
            method: 'definite_reference',
          };
          break;
        }
      }
    }
  }

  // Step 4: If we resolved something, also track the resolved entity
  if (bestResolution.resolvedEntity) {
    trackEntityInSession(
      sessionId,
      bestResolution.resolvedEntity,
      bestResolution.resolvedEntity,
      bestResolution.entityType || 'unknown'
    );
  }

  return bestResolution;
}

/**
 * Check if a query should trigger reference resolution.
 */
export function shouldResolveReferences(query: string): boolean {
  const words = query.split(/\s+/);
  for (const word of words) {
    const clean = word.toLowerCase().replace(/[.,!?;:]/g, '');
    if (PRONOUNS.has(clean)) return true;
  }

  // Check for definite references
  const definitePatterns = [
    /\bthe (project|app|application|team|group|database|db|server|service|api|issue|bug|problem|outage|file|module|component)\b/i,
  ];

  return definitePatterns.some(p => p.test(query));
}

// Backward compatibility
export const wouldBenefitFromReferenceResolution = shouldResolveReferences;