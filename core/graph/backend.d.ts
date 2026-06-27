/**
 * Graph Backend Abstraction
 *
 * Provides a unified interface for graph operations with the InMemoryGraphBackend.
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
//# sourceMappingURL=backend.d.ts.map
