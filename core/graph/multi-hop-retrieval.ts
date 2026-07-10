/**
 * Multi-Hop Retrieval
 * 
 * Combines vector search with graph traversal to answer queries that
 * require following relationships across entities.
 */

import { eq } from 'drizzle-orm';
import { getDb } from '../../db/index.js';
import { getSchema } from '../../db/schema.js';
import { hybridSearch, type SearchResult } from '../memory/hybrid-search.js';
import { extractEntitiesAndRelations } from './llm-entity-extractor.js';
import { extractEntityNames } from '../memory/entity-extractor.js';
import { findEntitiesByName, findPaths, traverse, type GraphNode, type TraversalPath } from './graph-traversal.js';
import { logger } from '../logger.js';
import { config } from '../../config.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface MultiHopResult extends SearchResult {
  /** How this result was found: 'vector' (direct search) or 'graph' (via traversal) */
  retrievalPath: 'vector' | 'graph' | 'both';
  /** The graph path that led to this result (if found via graph) */
  graphPath?: TraversalPath;
  /** Entities that connected this result to the query */
  connectingEntities?: string[];
  /** Hybrid score for backward compatibility */
  hybridScore?: number;
}

export interface MultiHopSearchOptions {
  /** Search query */
  query: string;
  /** Project path for scoping */
  project?: string;
  /** Maximum number of results */
  limit?: number;
  /** Maximum graph traversal depth */
  maxHops?: number;
  /** Whether to include vector-only results */
  includeVectorResults?: boolean;
  /** Whether to include graph-expanded results */
  includeGraphResults?: boolean;
  /** Minimum graph path weight to include */
  minPathWeight?: number;
  /** Session ID for context */
  sessionId?: string;
}

// ─── Main Multi-Hop Search ──────────────────────────────────────────────────

/**
 * Perform multi-hop search combining vector search with graph traversal.
 */
export async function multiHopSearch(
  options: MultiHopSearchOptions
): Promise<MultiHopResult[]> {
  const {
    query,
    project,
    limit = 10,
    maxHops = 3,
    includeVectorResults = true,
    includeGraphResults = true,
    minPathWeight = 1,
    sessionId,
  } = options;

  const results: MultiHopResult[] = [];
  const seenMemoryIds = new Set<string>();

  // Step 1: Extract query entities (respect global LLM config)
  let queryEntityNames: string[];
  try {
    const extraction = await extractEntitiesAndRelations(query, { preferLLM: config.llmEnabled });
    queryEntityNames = extraction.entities.map(e => e.name);
    logger.debug('Multi-hop search: entity extraction succeeded', {
      query: query.substring(0, 100),
      entities: queryEntityNames,
      source: extraction.source,
    });
  } catch (error) {
    // LLM failed or disabled - fall back to simple keyword extraction
    logger.debug('Multi-hop search: entity extraction failed, falling back to keywords', { error });
    const simpleEntities = extractEntityNames(query);
    queryEntityNames = simpleEntities;
    logger.debug('Multi-hop search: keyword extraction', {
      entities: queryEntityNames,
    });
  }

  // Step 2: Vector search (baseline results)
  if (includeVectorResults) {
    const vectorResults = await hybridSearch({
      query,
      project,
      limit: limit * 2, // Get more candidates for reranking
    });

    for (const result of vectorResults) {
      if (!seenMemoryIds.has(result.id)) {
        seenMemoryIds.add(result.id);
        results.push({
          ...result,
          retrievalPath: 'vector',
        });
      }
    }
  }

  // Step 3: Graph expansion (if we have entities)
  if (includeGraphResults && queryEntityNames.length > 0 && project) {
    const graphResults = await expandViaGraph(
      queryEntityNames,
      project,
      maxHops,
      minPathWeight,
      limit
    );

    // Find memories connected to graph-expanded entities
    for (const graphResult of graphResults) {
      // Search for memories mentioning the expanded entities
      const expandedMemories = await hybridSearch({
        query: graphResult.entityName,
        project,
        limit: 5,
      });

      for (const memory of expandedMemories) {
        if (!seenMemoryIds.has(memory.id)) {
          seenMemoryIds.add(memory.id);
          results.push({
            ...memory,
            retrievalPath: 'graph',
            graphPath: graphResult.path,
            connectingEntities: [graphResult.entityName],
          });
        }
      }
    }
  }

  // Step 4: Rank combined results
  // Vector results keep their hybrid score, graph results get a boost
  // for being connected to query entities via the knowledge graph
  const ranked = rankMultiHopResults(results, queryEntityNames);

  return ranked.slice(0, limit);
}

// ─── Graph Expansion ─────────────────────────────────────────────────────────

interface GraphExpansionResult {
  entityName: string;
  entityId: string;
  path: TraversalPath;
  relevanceScore: number;
}

/**
 * Expand query entities via the knowledge graph to find related entities.
 */
async function expandViaGraph(
  queryEntityNames: string[],
  project: string,
  maxHops: number,
  minPathWeight: number,
  limit: number
): Promise<GraphExpansionResult[]> {
  const db = await getDb();
  const schema = await getSchema();
  const results: GraphExpansionResult[] = [];
  const seenEntities = new Set<string>();

  // Get project ID
  const projectRows = await (db as any)
    .select({ id: schema.projects.id })
    .from(schema.projects)
    .where(eq(schema.projects.path, project))
    .limit(1);

  if (projectRows.length === 0) return [];

  const projectId = projectRows[0].id;

  // For each query entity, find it in the graph and expand
  for (const entityName of queryEntityNames) {
    const entities = await findEntitiesByName(entityName, projectId, { limit: 3 });

    for (const entity of entities) {
      if (seenEntities.has(entity.id)) continue;
      seenEntities.add(entity.id);

      // Traverse the graph from this entity
      const neighbors = await traverse(entity.id, {
        maxDepth: maxHops,
        minWeight: minPathWeight,
        limit: 20,
      });

      for (const neighbor of neighbors) {
        if (seenEntities.has(neighbor.id)) continue;
        seenEntities.add(neighbor.id);

        // Find the path from query entity to this neighbor
        const paths = await findPaths(entity.id, neighbor.id, {
          maxHops,
          minWeight: minPathWeight,
          maxPaths: 1,
        });

        if (paths.length > 0) {
          const path = paths[0];
          // Score based on path length and weight
          const relevanceScore = 1 / (1 + path.hopCount) * (1 / (1 + path.totalWeight * 0.1));

          results.push({
            entityName: neighbor.name,
            entityId: neighbor.id,
            path,
            relevanceScore,
          });
        }
      }
    }
  }

  // Sort by relevance score
  results.sort((a, b) => b.relevanceScore - a.relevanceScore);

  return results.slice(0, limit);
}

// ─── Result Ranking ──────────────────────────────────────────────────────────

/**
 * Rank multi-hop results combining vector score with graph connectivity.
 */
function rankMultiHopResults(
  results: MultiHopResult[],
  queryEntityNames: string[]
): MultiHopResult[] {
  return results
    .map(result => {
      let score = result.similarity || 0;

      // Boost for graph-connected results
      if (result.retrievalPath === 'graph' || result.retrievalPath === 'both') {
        score *= 1.2; // 20% boost for graph connectivity
      }

      // Boost for matching query entities in content
      const contentLower = (result.content || '').toLowerCase();
      for (const entity of queryEntityNames) {
        if (contentLower.includes(entity.toLowerCase())) {
          score *= 1.1; // 10% boost per entity match
        }
      }

      // Boost for shorter graph paths (more direct connections)
      if (result.graphPath) {
        const pathBonus = 1 / (1 + result.graphPath.hopCount * 0.2);
        score *= (1 + pathBonus * 0.15); // Up to 15% bonus for short paths
      }

      return {
        ...result,
        similarity: Math.round(score * 1000) / 1000,
        hybridScore: Math.round(score * 100) / 100, // Backward compat
      };
    })
    .sort((a, b) => (b.similarity || 0) - (a.similarity || 0));
}

// ─── Utility ────────────────────────────────────────────────────────────────

/** Check if query needs multi-hop graph traversal. */
export function needsMultiHop(query: string): boolean {
  // Queries with relationship indicators benefit from multi-hop
  const relationshipPatterns = [
    /\b(affected by|caused by|related to|connected to|depends? on|works? on|uses?|manages?)\b/i,
    /\b(who|what|which|how)\b.*\b(project|team|system|service|database)\b/i,
    /\b(impact|affect|influence|caus\w+|result|lead to)\b/i,
  ];

  return relationshipPatterns.some(pattern => pattern.test(query));
}

/**
 * Get a human-readable explanation of how a multi-hop result was found.
 */
export function explainRetrievalPath(result: MultiHopResult): string {
  if (result.retrievalPath === 'vector') {
    return `Found via semantic search (score: ${result.similarity?.toFixed(2)})`;
  }

  if (result.retrievalPath === 'graph' && result.graphPath) {
    const pathSteps = result.graphPath.nodes
      .map(n => n.name)
      .join(' → ');
    return `Found via knowledge graph: ${pathSteps} (hops: ${result.graphPath.hopCount})`;
  }

  if (result.retrievalPath === 'both' && result.graphPath) {
    const pathSteps = result.graphPath.nodes
      .map(n => n.name)
      .join(' → ');
    return `Found via both search and graph: ${pathSteps} (score: ${result.similarity?.toFixed(2)})`;
  }

  return `Found via ${result.retrievalPath} search`;
}

// Backward compatibility alias
export const wouldBenefitFromMultiHop = needsMultiHop;