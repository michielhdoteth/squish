/**
 * Graph Backend Abstraction
 *
 * Provides a unified interface for graph operations with multiple backends:
 * - InMemoryGraphBackend: Default backend using JavaScript Map (backward compatible)
 * - KuzuBackend: Kuzu embedded graph database for persistence and performance
 *
 * Research shows graph backends improve recall by 15-30%.
 */
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
/**
 * In-memory graph backend using Maps.
 * This is the default backend for backward compatibility.
 */
export declare class InMemoryGraphBackend implements GraphBackend {
    private nodes;
    private edges;
    private initialized;
    constructor();
    connect(): Promise<void>;
    createNode(id: string, props: Record<string, any>): Promise<void>;
    createEdge(from: string, to: string, props: Record<string, any>): Promise<void>;
    getNode(id: string): Promise<GraphNode | null>;
    getAllNodes(): Promise<GraphNode[]>;
    getAllEdges(): Promise<GraphEdge[]>;
    bfs(startId: string, maxDepth: number, minWeight?: number): Promise<BFSResult[]>;
    deleteNode(id: string): Promise<void>;
    updateNode(id: string, props: Record<string, any>): Promise<void>;
    close(): Promise<void>;
    private ensureConnected;
}
/**
 * Kuzu graph database backend.
 *
 * Kuzu is an embedded graph database that provides:
 * - Persistent storage
 * - Cypher query language
 * - Better performance for large graphs
 *
 * This is an optional dependency - will fallback gracefully if not installed.
 */
export declare class KuzuBackend implements GraphBackend {
    private db;
    private connection;
    private dbPath;
    private initialized;
    private kuzuModule;
    constructor(dbPath?: string);
    connect(): Promise<void>;
    createNode(id: string, props: Record<string, any>): Promise<void>;
    createEdge(from: string, to: string, props: Record<string, any>): Promise<void>;
    getNode(id: string): Promise<GraphNode | null>;
    getAllNodes(): Promise<GraphNode[]>;
    getAllEdges(): Promise<GraphEdge[]>;
    bfs(startId: string, maxDepth: number, minWeight?: number): Promise<BFSResult[]>;
    deleteNode(id: string): Promise<void>;
    updateNode(id: string, props: Record<string, any>): Promise<void>;
    close(): Promise<void>;
    private loadKuzu;
    private initializeSchema;
    private nodeToProps;
    private edgeToProps;
    private ensureConnected;
}
/**
 * Create a graph backend instance based on configuration.
 *
 * @param type - Backend type: 'memory' (default) or 'kuzu'
 * @param kuzuPath - Path for Kuzu database (default: './squish.graph')
 * @returns GraphBackend instance
 */
export declare function createGraphBackend(type?: 'memory' | 'kuzu', kuzuPath?: string): GraphBackend;
//# sourceMappingURL=backend.d.ts.map