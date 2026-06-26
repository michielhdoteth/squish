/**
 * Graph Export Module
 * Generates standalone HTML visualization of the knowledge graph.
 * Part of the existing graph system - no new commands needed.
 * Auto-exports on lifecycle events if graphAutoExport is enabled.
 */
export interface GraphExportResult {
    htmlPath: string;
    jsonPath: string;
    nodeCount: number;
    edgeCount: number;
}
/**
 * Generate a standalone HTML knowledge graph visualization.
 * Writes to .squish/graph.html and .squish/graph.json
 */
export declare function exportGraphVisualization(projectPath?: string): Promise<GraphExportResult>;
//# sourceMappingURL=export.d.ts.map