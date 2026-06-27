/**
 * Graph Backend Abstraction
 *
 * Provides a unified interface for graph operations with the InMemoryGraphBackend.
 * Research shows graph backends improve recall by 15-30%.
 */

import { logger } from '../logger.js';
import type { GraphNode as GraphBoostNode } from '../search/graph-boost.js';

// ============================================================
// Types
// ============================================================

export interface GraphNode {
  id: string;
  props: Record<string, any>;
}

export interface GraphEdge {
  from: string;
  to: string;
  props: Record<string, any>;
}

export interface BFSResult {
  id: string;
  depth: number;
  weight: number;
  coactivationCount: number;
  lastAccessedAt: string | Date;
  associationType: string;
}

// ============================================================
// GraphBackend Interface
// ============================================================

export interface GraphBackend {
  /** Initialize the backend connection */
  connect(): Promise<void>;

  /** Create or update a node */
  createNode(id: string, props: Record<string, any>): Promise<void>;

  /** Create an edge between two nodes */
  createEdge(from: string, to: string, props: Record<string, any>): Promise<void>;

  /** Get a node by ID */
  getNode(id: string): Promise<GraphNode | null>;

  /** Get all nodes */
  getAllNodes(): Promise<GraphNode[]>;

  /** Get all edges */
  getAllEdges(): Promise<GraphEdge[]>;

  /** BFS traversal from a starting node */
  bfs(startId: string, maxDepth: number, minWeight?: number): Promise<BFSResult[]>;

  /** Delete a node and its edges */
  deleteNode(id: string): Promise<void>;

  /** Update node properties */
  updateNode(id: string, props: Record<string, any>): Promise<void>;

  /** Close the backend connection */
  close(): Promise<void>;
}

// ============================================================
// InMemoryGraphBackend (Default)
// ============================================================

/**
 * In-memory graph backend using Maps.
 * This is the default backend for backward compatibility.
 */
export class InMemoryGraphBackend implements GraphBackend {
  private nodes: Map<string, GraphNode>;
  private edges: Map<string, GraphEdge[]>;
  private initialized: boolean = false;

  constructor() {
    this.nodes = new Map();
    this.edges = new Map();
  }

  async connect(): Promise<void> {
    if (this.initialized) {
      logger.debug('InMemoryGraphBackend already connected');
      return;
    }
    this.initialized = true;
    logger.info('InMemoryGraphBackend connected');
  }

  async createNode(id: string, props: Record<string, any>): Promise<void> {
    this.ensureConnected();
    this.nodes.set(id, { id, props });
    logger.debug('Node created', { id, props });
  }

  async createEdge(from: string, to: string, props: Record<string, any>): Promise<void> {
    this.ensureConnected();

    // Ensure nodes exist
    if (!this.nodes.has(from)) {
      await this.createNode(from, { type: 'auto-created' });
    }
    if (!this.nodes.has(to)) {
      await this.createNode(to, { type: 'auto-created' });
    }

    // Add edge
    if (!this.edges.has(from)) {
      this.edges.set(from, []);
    }
    this.edges.get(from)!.push({ from, to, props });
    logger.debug('Edge created', { from, to, props });
  }

  async getNode(id: string): Promise<GraphNode | null> {
    this.ensureConnected();
    return this.nodes.get(id) || null;
  }

  async getAllNodes(): Promise<GraphNode[]> {
    this.ensureConnected();
    return Array.from(this.nodes.values());
  }

  async getAllEdges(): Promise<GraphEdge[]> {
    this.ensureConnected();
    const allEdges: GraphEdge[] = [];
    for (const edges of this.edges.values()) {
      allEdges.push(...edges);
    }
    return allEdges;
  }

  async bfs(startId: string, maxDepth: number, minWeight: number = 0.3): Promise<BFSResult[]> {
    this.ensureConnected();
    const visited = new Set<string>();
    const queue: { id: string; depth: number }[] = [{ id: startId, depth: 0 }];
    const results: BFSResult[] = [];

    while (queue.length > 0) {
      const current = queue.shift()!;

      if (visited.has(current.id) || current.depth > maxDepth) {
        continue;
      }
      visited.add(current.id);

      // Get outgoing edges
      const outgoingEdges = this.edges.get(current.id) || [];

      for (const edge of outgoingEdges) {
        if (edge.props.weight < minWeight) {
          continue;
        }

        const newNodeDepth = current.depth + 1;
        if (newNodeDepth > maxDepth) {
          continue;
        }

        results.push({
          id: edge.to,
          depth: newNodeDepth,
          weight: edge.props.weight || 0.5,
          coactivationCount: edge.props.coactivationCount || 1,
          lastAccessedAt: edge.props.lastAccessedAt || new Date().toISOString(),
          associationType: edge.props.associationType || 'relates_to',
        });

        if (newNodeDepth < maxDepth && !visited.has(edge.to)) {
          queue.push({ id: edge.to, depth: newNodeDepth });
        }
      }
    }

    return results;
  }

  async deleteNode(id: string): Promise<void> {
    this.ensureConnected();
    this.nodes.delete(id);

    // Remove edges pointing to this node
    for (const [fromId, edges] of this.edges.entries()) {
      const filtered = edges.filter((e) => e.to !== id);
      if (filtered.length !== edges.length) {
        this.edges.set(fromId, filtered);
      }
    }

    // Remove edges from this node
    this.edges.delete(id);

    logger.debug('Node deleted', { id });
  }

  async updateNode(id: string, props: Record<string, any>): Promise<void> {
    this.ensureConnected();
    const node = this.nodes.get(id);
    if (node) {
      node.props = { ...node.props, ...props };
      logger.debug('Node updated', { id, props });
    }
  }

  async close(): Promise<void> {
    if (!this.initialized) {
      return;
    }
    this.nodes.clear();
    this.edges.clear();
    this.initialized = false;
    logger.info('InMemoryGraphBackend closed');
  }

  private ensureConnected(): void {
    if (!this.initialized) {
      throw new Error('InMemoryGraphBackend not connected. Call connect() first.');
    }
  }
}


