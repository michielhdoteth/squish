/**
 * Graph Operations
 *
 * Traversal, neighborhood, and path-finding via the storage layer.
 */

import { traverse, getNeighborhood, findEntitiesByName, findPaths } from '../graph/graph-traversal.js';
import type { RelationType } from '../graph/llm-entity-extractor.js';
import type { GraphTraversalResult, EntityRelation } from './types.js';
import type { NeighborhoodResult, TraversalPath } from '../graph/graph-traversal.js';

/**
 * Get the neighborhood around an entity -- all entities within N hops.
 */
export async function getEntityNeighborhood(
  entityName: string,
  projectId: string,
  options?: {
    radius?: number;
    relationTypes?: RelationType[];
    minWeight?: number;
    limit?: number;
  }
): Promise<NeighborhoodResult | null> {
  const nodes = await findEntitiesByName(entityName, projectId, { limit: 1, fuzzy: true });
  if (nodes.length === 0) return null;
  return getNeighborhood(nodes[0].id, options);
}

/**
 * Traverse the graph from an entity name.
 */
export async function traverseGraph(
  entityName: string,
  projectId: string,
  options?: {
    maxDepth?: number;
    relationTypes?: RelationType[];
    minWeight?: number;
    direction?: 'outgoing' | 'incoming' | 'both';
    limit?: number;
  }
): Promise<GraphTraversalResult> {
  const nodes = await findEntitiesByName(entityName, projectId, { limit: 1, fuzzy: true });
  if (nodes.length === 0) {
    return { nodes: [], edges: [], paths: [] };
  }

  const startId = nodes[0].id;
  const traversedNodes = await traverse(startId, options);

  const neighborhood = await getNeighborhood(startId, {
    radius: options?.maxDepth ?? 3,
    relationTypes: options?.relationTypes,
    minWeight: options?.minWeight,
    limit: options?.limit ?? 50,
  });

  return {
    nodes: traversedNodes,
    edges: neighborhood?.edges ?? [],
    paths: [],
  };
}

/**
 * Find all paths between two entity names.
 */
export async function findEntityPaths(
  fromName: string,
  toName: string,
  projectId: string,
  options?: {
    maxHops?: number;
    relationTypes?: RelationType[];
    minWeight?: number;
    maxPaths?: number;
  }
): Promise<TraversalPath[]> {
  const fromNodes = await findEntitiesByName(fromName, projectId, { limit: 1, fuzzy: true });
  const toNodes = await findEntitiesByName(toName, projectId, { limit: 1, fuzzy: true });
  if (fromNodes.length === 0 || toNodes.length === 0) return [];
  return findPaths(fromNodes[0].id, toNodes[0].id, options);
}
