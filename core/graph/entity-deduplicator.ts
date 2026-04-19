/**
 * Entity Deduplicator
 * 
 * Deduplicates entities using embedding similarity and string matching.
 * Critical for knowledge graph - prevents duplicate nodes for aliases like "AWS" / "Amazon Web Services".
 */

import { eq, and, or, sql } from 'drizzle-orm';
import { getDb } from '../../db/index.js';
import { getSchema } from '../../db/schema.js';
import { getEmbedding } from '../embeddings.js';
import { cosineSimilarity } from '../utils/vector-operations.js';
import { parseEmbedding } from '../lib/parse-embedding.js';
import { logger } from '../logger.js';

export interface DeduplicationResult {
  merged: number;
  aliases: Array<{ from: string; to: string; similarity: number }>;
  totalEntities: number;
  uniqueEntities: number;
}

// Common entity aliases for normalization
const KNOWN_ALIASES: Record<string, string[]> = {
  'amazon web services': ['aws'],
  'aws': ['amazon web services'],
  'postgresql': ['postgres', 'pg'],
  'kubernetes': ['k8s'],
  'k8s': ['kubernetes'],
  'javascript': ['js'],
  'typescript': ['ts'],
  'node.js': ['nodejs', 'node'],
  'react.js': ['react'],
  'vue.js': ['vue'],
  'machine learning': ['ml'],
  'artificial intelligence': ['ai'],
  'large language model': ['llm'],
  'natural language processing': ['nlp'],
};

/**
 * Find and merge duplicate entities in a project.
 */
export async function deduplicateProjectEntities(
  projectId: string,
  options?: {
    similarityThreshold?: number;
    dryRun?: boolean;
  }
): Promise<DeduplicationResult> {
  const { similarityThreshold = 0.85, dryRun = false } = options || {};
  const db = await getDb();
  const schema = await getSchema();

  // Get all entities for the project
  const entities = await (db as any)
    .select()
    .from(schema.entities)
    .where(eq(schema.entities.projectId, projectId));

  if (entities.length < 2) {
    return {
      merged: 0,
      aliases: [],
      totalEntities: entities.length,
      uniqueEntities: entities.length,
    };
  }

  const aliases: Array<{ from: string; to: string; similarity: number }> = [];
  const merged = new Set<string>();
  let mergeCount = 0;

  // Compare each pair of entities
  for (let i = 0; i < entities.length; i++) {
    if (merged.has(entities[i].id)) continue;

    for (let j = i + 1; j < entities.length; j++) {
      if (merged.has(entities[j].id)) continue;

      const similarity = await computeEntitySimilarity(entities[i], entities[j]);

      if (similarity >= similarityThreshold) {
        // Merge j into i (keep the one with more mentions)
        const target = (entities[i].mentionCount || 0) >= (entities[j].mentionCount || 0)
          ? entities[i]
          : entities[j];
        const source = target.id === entities[i].id ? entities[j] : entities[i];

        aliases.push({
          from: source.name,
          to: target.name,
          similarity,
        });

        if (!dryRun) {
          await mergeEntities(source, target, db, schema);
        }

        merged.add(source.id);
        mergeCount++;
      }
    }
  }

  logger.info('Entity deduplication completed', {
    projectId,
    totalEntities: entities.length,
    merged: mergeCount,
    dryRun,
  });

  return {
    merged: mergeCount,
    aliases,
    totalEntities: entities.length,
    uniqueEntities: entities.length - mergeCount,
  };
}

/**
 * Compute similarity between two entities.
 * Uses a combination of string matching, known aliases, and embedding similarity.
 */
async function computeEntitySimilarity(entity1: any, entity2: any): Promise<number> {
  // Must be same type to be considered duplicates
  if (entity1.type !== entity2.type) {
    return 0;
  }

  const name1 = entity1.name.toLowerCase().trim();
  const name2 = entity2.name.toLowerCase().trim();

  // Exact match
  if (name1 === name2) return 1.0;

  // Check known aliases
  const name1Aliases = KNOWN_ALIASES[name1] || [];
  const name2Aliases = KNOWN_ALIASES[name2] || [];

  if (name1Aliases.includes(name2) || name2Aliases.includes(name1)) {
    return 0.99; // Very high confidence for known aliases
  }

  // String similarity (Jaccard on words)
  const words1 = new Set(name1.split(/[\s._-]+/).filter((w: string) => w.length > 1));
  const words2 = new Set(name2.split(/[\s._-]+/).filter((w: string) => w.length > 1));

  const words1Arr = Array.from(words1);
  const words2Arr = Array.from(words2);
  const intersection = words1Arr.filter(w => words2.has(w));
  const union = new Set([...words1Arr, ...words2Arr]);

  if (words1.size > 0 && words2.size > 0) {
    const jaccard = intersection.length / union.size;

    if (jaccard >= 0.8) return jaccard;
  }

  // One contains the other (e.g., "React" in "React.js")
  if (name1.includes(name2) || name2.includes(name1)) {
    const shorter = name1.length < name2.length ? name1 : name2;
    const longer = name1.length < name2.length ? name2 : name1;
    // Only count as similar if the shorter name is a significant portion
    if (shorter.length / longer.length >= 0.5) {
      return 0.85;
    }
  }

  // Embedding similarity (if available)
  const embedding1 = parseEmbedding(entity1.embedding || entity1.embedding_json);
  const embedding2 = parseEmbedding(entity2.embedding || entity2.embedding_json);

  if (embedding1 && embedding2) {
    const embSimilarity = cosineSimilarity(embedding1, embedding2);
    if (embSimilarity >= similarityThreshold) {
      return embSimilarity;
    }
  }

  return 0;
}

/**
 * Merge source entity into target entity.
 * Updates all relations pointing to source to point to target instead.
 */
async function mergeEntities(
  source: any,
  target: any,
  db: any,
  schema: any
): Promise<void> {
  // Update all relations pointing FROM source to point FROM target
  await db
    .update(schema.entityRelations)
    .set({ fromEntityId: target.id })
    .where(eq(schema.entityRelations.fromEntityId, source.id));

  // Update all relations pointing TO source to point TO target
  await db
    .update(schema.entityRelations)
    .set({ toEntityId: target.id })
    .where(eq(schema.entityRelations.toEntityId, source.id));

  // Add source name as alias to target
  const existingAliases = Array.isArray(target.aliases) ? target.aliases as string[] : [];
  const updatedAliases = [...new Set([...existingAliases, source.name])];

  await db
    .update(schema.entities)
    .set({
      aliases: updatedAliases as any,
      mentionCount: (target.mentionCount || 0) + (source.mentionCount || 0),
      updatedAt: new Date(),
    })
    .where(eq(schema.entities.id, target.id));

  // Delete source entity
  await db
    .delete(schema.entities)
    .where(eq(schema.entities.id, source.id));

  logger.debug('Merged entity', {
    source: source.name,
    target: target.name,
    aliases: updatedAliases,
  });
}

// Module-level threshold for embedding similarity
const similarityThreshold = 0.85;