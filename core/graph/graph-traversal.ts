/**
 * Graph Traversal Engine
 * 
 * BFS/DFS traversal of the entity relationship graph. This is the
 * core capability that enables multi-hop queries like:
 * 
 *   "Was Alice's project affected by Tuesday's outage?"
 * 
 * Which requires traversing: Alice → works_on → Project Atlas → uses → PostgreSQL → caused → outage
 * 
 * Vector search alone can't answer this because the bridge fact
 * ("Project Atlas uses PostgreSQL") mentions neither Alice nor Tuesday.
 */

import { eq, and, or, desc, inArray, sql } from 'drizzle-orm';
import { getDb } from '../../db/index.js';
import { getSchema } from '../../db/schema.js';
import { logger } from '../logger.js';
import type { RelationType } from './llm-entity-extractor.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface GraphNode {
  id: string;
  name: string;
  type: string;
  description: string | null;
  properties: Record<string, unknown> | null;
}

export interface GraphEdge {
  id: string;
  fromId: string;
  toId: string;
  relationType: RelationType | string;
  weight: number;
  properties: Record<string, unknown> | null;
}

export interface TraversalPath {
  nodes: GraphNode[];
  edges: GraphEdge[];
  totalWeight: number;
  hopCount: number;
}

export interface NeighborhoodResult {
  center: GraphNode;
  nodes: GraphNode[];
  edges: GraphEdge[];
  radius: number;
}

// ─── Core Traversal ─────────────────────────────────────────────────────────

/**
 * BFS traversal from a starting entity, following relationship edges.
 * Returns all reachable entities within maxDepth hops.
 */
export async function traverse(
  startEntityId: string,
  options?: {
    maxDepth?: number;
    relationTypes?: RelationType[];
    minWeight?: number;
    direction?: 'outgoing' | 'incoming' | 'both';
    limit?: number;
  }
): Promise<GraphNode[]> {
  const {
    maxDepth = 3,
    relationTypes,
    minWeight = 0,
    direction = 'both',
    limit = 50,
  } = options || {};

  const db = await getDb();
  const schema = await getSchema();
  const visited = new Set<string>([startEntityId]);
  const result: GraphNode[] = [];
  let currentLevel = [startEntityId];

  for (let depth = 0; depth < maxDepth; depth++) {
    if (currentLevel.length === 0) break;

    const nextLevel: string[] = [];

    for (const entityId of currentLevel) {
      // Get connected entities
      const connected = await getConnectedEntities(
        entityId,
        db,
        schema,
        direction,
        relationTypes,
        minWeight
      );

      for (const { id, edge } of connected) {
        if (!visited.has(id)) {
          visited.add(id);
          nextLevel.push(id);

          // Fetch the entity details
          const entity = await (db as any)
            .select()
            .from(schema.entities)
            .where(eq(schema.entities.id, id))
            .limit(1);

          if (entity.length > 0) {
            result.push({
              id: entity[0].id,
              name: entity[0].name,
              type: entity[0].type,
              description: entity[0].description,
              properties: entity[0].properties,
            });
          }

          if (result.length >= limit) break;
        }
      }

      if (result.length >= limit) break;
    }

    currentLevel = nextLevel;
  }

  return result;
}

/**
 * Find all paths between two entities within a maximum number of hops.
 * Uses BFS with path tracking.
 */
export async function findPaths(
  fromEntityId: string,
  toEntityId: string,
  options?: {
    maxHops?: number;
    relationTypes?: RelationType[];
    minWeight?: number;
    maxPaths?: number;
  }
): Promise<TraversalPath[]> {
  const {
    maxHops = 4,
    relationTypes,
    minWeight = 0,
    maxPaths = 5,
  } = options || {};

  const db = await getDb();
  const schema = await getSchema();
  const paths: TraversalPath[] = [];

  // BFS with path tracking
  const queue: Array<{ nodeId: string; path: { nodes: GraphNode[]; edges: GraphEdge[]; weight: number } }> = [{
    nodeId: fromEntityId,
    path: { nodes: [], edges: [], weight: 0 },
  }];

  const visited = new Map<string, number>(); // nodeId -> best weight to reach it

  // Start entity
  const startEntity = await (db as any)
    .select()
    .from(schema.entities)
    .where(eq(schema.entities.id, fromEntityId))
    .limit(1);

  if (startEntity.length === 0) return [];

  const startNode: GraphNode = {
    id: startEntity[0].id,
    name: startEntity[0].name,
    type: startEntity[0].type,
    description: startEntity[0].description,
    properties: startEntity[0].properties,
  };

  queue[0].path.nodes.push(startNode);

  while (queue.length > 0 && paths.length < maxPaths) {
    const { nodeId, path } = queue.shift()!;

    if (path.nodes.length > maxHops + 1) continue;

    // Found target
    if (nodeId === toEntityId && path.nodes.length > 1) {
      paths.push({
        nodes: [...path.nodes],
        edges: [...path.edges],
        totalWeight: path.weight,
        hopCount: path.edges.length,
      });
      continue;
    }

    // Get connected entities
    const connected = await getConnectedEntities(
      nodeId,
      db,
      schema,
      'outgoing',
      relationTypes,
      minWeight
    );

    for (const { id, edge } of connected) {
      // Avoid cycles
      if (path.nodes.some(n => n.id === id)) continue;

      // Prune if we already found a better path to this node
      const currentBest = visited.get(id);
      if (currentBest !== undefined && path.weight + edge.weight >= currentBest) continue;
      visited.set(id, path.weight + edge.weight);

      // Get entity details
      const entity = await (db as any)
        .select()
        .from(schema.entities)
        .where(eq(schema.entities.id, id))
        .limit(1);

      if (entity.length === 0) continue;

      const node: GraphNode = {
        id: entity[0].id,
        name: entity[0].name,
        type: entity[0].type,
        description: entity[0].description,
        properties: entity[0].properties,
      };

      queue.push({
        nodeId: id,
        path: {
          nodes: [...path.nodes, node],
          edges: [...path.edges, edge],
          weight: path.weight + (edge.weight || 1),
        },
      });
    }
  }

  // Sort paths by weight (lower is better)
  paths.sort((a, b) => a.totalWeight - b.totalWeight);

  return paths;
}

/**
 * Get the neighborhood around an entity - all entities within N hops.
 * Returns both the entities and the edges connecting them.
 */
export async function getNeighborhood(
  centerEntityId: string,
  options?: {
    radius?: number;
    relationTypes?: RelationType[];
    minWeight?: number;
    limit?: number;
  }
): Promise<NeighborhoodResult | null> {
  const {
    radius = 2,
    relationTypes,
    minWeight = 0,
    limit = 30,
  } = options || {};

  const db = await getDb();
  const schema = await getSchema();

  // Get center entity
  const centerEntity = await (db as any)
    .select()
    .from(schema.entities)
    .where(eq(schema.entities.id, centerEntityId))
    .limit(1);

  if (centerEntity.length === 0) return null;

  const center: GraphNode = {
    id: centerEntity[0].id,
    name: centerEntity[0].name,
    type: centerEntity[0].type,
    description: centerEntity[0].description,
    properties: centerEntity[0].properties,
  };

  const nodes: GraphNode[] = [center];
  const edges: GraphEdge[] = [];
  const visited = new Set<string>([centerEntityId]);
  let currentLevel = [centerEntityId];

  for (let hop = 0; hop < radius; hop++) {
    const nextLevel: string[] = [];

    for (const entityId of currentLevel) {
      const connected = await getConnectedEntities(
        entityId,
        db,
        schema,
        'both',
        relationTypes,
        minWeight
      );

      for (const { id, edge } of connected) {
        if (!visited.has(id)) {
          visited.add(id);
          nextLevel.push(id);

          const entity = await (db as any)
            .select()
            .from(schema.entities)
            .where(eq(schema.entities.id, id))
            .limit(1);

          if (entity.length > 0) {
            nodes.push({
              id: entity[0].id,
              name: entity[0].name,
              type: entity[0].type,
              description: entity[0].description,
              properties: entity[0].properties,
            });
          }
        }

        edges.push(edge);
      }

      if (nodes.length >= limit) break;
    }

    currentLevel = nextLevel;
    if (nodes.length >= limit) break;
  }

  return { center, nodes, edges, radius };
}

/**
 * Find entities by name (fuzzy matching).
 */
export async function findEntitiesByName(
  name: string,
  projectId: string,
  options?: {
    limit?: number;
    fuzzy?: boolean;
  }
): Promise<GraphNode[]> {
  const { limit = 10, fuzzy = true } = options || {};
  const db = await getDb();
  const schema = await getSchema();

  // Try exact match first
  const exact = await (db as any)
    .select()
    .from(schema.entities)
    .where(
      and(
        eq(schema.entities.projectId, projectId),
        eq(schema.entities.name, name)
      )
    )
    .limit(limit);

  if (exact.length > 0) {
    return exact.map((e: any) => ({
      id: e.id,
      name: e.name,
      type: e.type,
      description: e.description,
      properties: e.properties,
    }));
  }

  // Fuzzy match using LIKE
  if (fuzzy) {
    const fuzzyResults = await (db as any)
      .select()
      .from(schema.entities)
      .where(
        and(
          eq(schema.entities.projectId, projectId),
          sql`LOWER(${schema.entities.name}) LIKE LOWER(${'%' + name + '%'})`
        )
      )
      .limit(limit);

    return fuzzyResults.map((e: any) => ({
      id: e.id,
      name: e.name,
      type: e.type,
      description: e.description,
      properties: e.properties,
    }));
  }

  return [];
}

// ─── Helper Functions ────────────────────────────────────────────────────────

/**
 * Get entities connected to a given entity via relations.
 */
async function getConnectedEntities(
  entityId: string,
  db: any,
  schema: any,
  direction: 'outgoing' | 'incoming' | 'both',
  relationTypes?: RelationType[],
  minWeight: number = 0
): Promise<Array<{ id: string; edge: GraphEdge }>> {
  const results: Array<{ id: string; edge: GraphEdge }> = [];

  // Build where conditions
  const conditions: any[] = [];

  if (direction === 'outgoing' || direction === 'both') {
    // Relations FROM this entity
    let outgoingWhere: any = eq(schema.entityRelations.fromEntityId, entityId);
    if (minWeight > 0) {
      outgoingWhere = and(outgoingWhere, sql`${schema.entityRelations.weight} >= ${minWeight}`);
    }
    if (relationTypes && relationTypes.length > 0) {
      outgoingWhere = and(outgoingWhere, or(...relationTypes.map(t => eq(schema.entityRelations.type, t))));
    }

    const outgoing = await db
      .select()
      .from(schema.entityRelations)
      .where(outgoingWhere);

    for (const rel of outgoing) {
      results.push({
        id: rel.toEntityId,
        edge: {
          id: rel.id,
          fromId: rel.fromEntityId,
          toId: rel.toEntityId,
          relationType: rel.type,
          weight: rel.weight || 1,
          properties: rel.properties,
        },
      });
    }
  }

  if (direction === 'incoming' || direction === 'both') {
    // Relations TO this entity
    let incomingWhere: any = eq(schema.entityRelations.toEntityId, entityId);
    if (minWeight > 0) {
      incomingWhere = and(incomingWhere, sql`${schema.entityRelations.weight} >= ${minWeight}`);
    }
    if (relationTypes && relationTypes.length > 0) {
      incomingWhere = and(incomingWhere, or(...relationTypes.map(t => eq(schema.entityRelations.type, t))));
    }

    const incoming = await db
      .select()
      .from(schema.entityRelations)
      .where(incomingWhere);

    for (const rel of incoming) {
      results.push({
        id: rel.fromEntityId,
        edge: {
          id: rel.id,
          fromId: rel.fromEntityId,
          toId: rel.toEntityId,
          relationType: rel.type,
          weight: rel.weight || 1,
          properties: rel.properties,
        },
      });
    }
  }

  return results;
}