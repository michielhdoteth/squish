/**
 * QMD MCP Client
 *
 * Connects to QMD (Quick Markdown Search) MCP server for hybrid search capabilities.
 * QMD provides BM25 full-text search, vector semantic search, and LLM re-ranking.
 *
 * Installation: install qmd globally with your package manager (for example: npm install -g qmd)
 * GitHub: https://github.com/tobi/qmd
 *
 * QMD MCP Tools:
 * - qmd_search: Fast BM25 keyword search
 * - qmd_vsearch: Semantic vector search
 * - qmd_query: Hybrid search with re-ranking (best quality)
 * - qmd_get: Retrieve document by path or docid
 * - qmd_multi_get: Retrieve multiple documents
 * - qmd_status: Index health and collection info
 */
export interface QMDSearchOptions {
    query: string;
    collection?: string;
    limit?: number;
    minScore?: number;
}
export interface QMDSearchResult {
    docid: string;
    path: string;
    title: string;
    context: string;
    score: number;
    snippet: string;
}
export interface QMDStatusResult {
    indexHealth: string;
    collections: Array<{
        name: string;
        path: string;
        documentCount: number;
    }>;
}
export interface QMDGetOptions {
    pathOrDocid: string;
    full?: boolean;
    maxBytes?: number;
}
/**
 * QMD MCP Client class
 *
 * Manages connection to QMD MCP server and provides methods for
 * search, document retrieval, and status checking.
 */
export declare class QMDClient {
    private client;
    private transport;
    private connected;
    private connecting;
    /**
     * Check if QMD is installed on the system
     */
    checkQMDInstalled(): Promise<boolean>;
    /**
     * Connect to QMD MCP server
     * QMD must be installed globally and available on PATH
     */
    connect(): Promise<boolean>;
    /**
     * Check if QMD is available
     */
    isAvailable(): Promise<boolean>;
    /**
     * Fast BM25 keyword search
     * Uses SQLite FTS5 for fast full-text search
     */
    search(options: QMDSearchOptions): Promise<QMDSearchResult[]>;
    /**
     * Semantic vector search
     * Uses embedding-based similarity search
     */
    vsearch(options: QMDSearchOptions): Promise<QMDSearchResult[]>;
    /**
     * Hybrid search with re-ranking (best quality)
     * Combines BM25 + vector search + LLM re-ranking
     */
    query(options: QMDSearchOptions): Promise<QMDSearchResult[]>;
    /**
     * Get QMD index status and collection info
     */
    status(): Promise<QMDStatusResult | null>;
    /**
     * Get document by path or docid
     */
    get(options: QMDGetOptions): Promise<string>;
    /**
     * Get multiple documents by glob pattern or list
     */
    multiGet(patternOrList: string | string[], options?: {
        maxBytes?: number;
        limit?: number;
    }): Promise<string[]>;
    /**
     * Disconnect from QMD MCP server
     */
    disconnect(): Promise<void>;
    /**
     * Parse search results from QMD response
     */
    private parseSearchResults;
    /**
     * Parse QMD's text output format into structured results
     */
    private parseTextSearchResults;
    /**
     * Finalize a parsed result with defaults
     */
    private finalizeResult;
    /**
     * Parse status result
     */
    private parseStatusResult;
    /**
     * Parse get result
     */
    private parseGetResult;
    /**
     * Parse multi-get result
     */
    private parseMultiGetResult;
}
/**
 * Get the singleton QMD client instance
 */
export declare function getQMDClient(): Promise<QMDClient>;
/**
 * Reset the singleton QMD client (useful for testing)
 */
export declare function resetQMDClient(): void;
//# sourceMappingURL=qmd-client.d.ts.map