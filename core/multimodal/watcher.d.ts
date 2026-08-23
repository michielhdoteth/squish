/**
 * File Watcher
 *
 * Watches an inbox directory for new media files and auto-ingests them.
 * Uses polling (not native fs.watch) for cross-platform reliability.
 *
 * Design:
 * - Polls every 5 seconds (configurable)
 * - Tracks processed files by path + mtime to avoid re-processing
 * - Max file size limit (default 100MB) to prevent memory issues
 * - Graceful shutdown via stop()
 */
export interface WatcherConfig {
    /** Directory to watch for new files (default: ./inbox) */
    inboxDir: string;
    /** Polling interval in ms (default: 5000) */
    pollIntervalMs: number;
    /** Max file size in bytes (default: 100MB) */
    maxFileSizeBytes: number;
    /** Project ID to assign ingested memories to */
    projectId?: string;
    /** Tags to add to all ingested memories */
    tags?: string[];
}
export declare class InboxWatcher {
    private config;
    private timer;
    private processed;
    private running;
    constructor(config?: Partial<WatcherConfig>);
    /**
     * Start watching the inbox directory.
     */
    start(): void;
    /**
     * Stop watching and clean up.
     */
    stop(): void;
    /**
     * Get stats about the watcher.
     */
    stats(): {
        running: boolean;
        processedCount: number;
        inboxDir: string;
    };
    private poll;
    private processEntry;
}
/**
 * Create and start an inbox watcher with default settings.
 */
export declare function startInboxWatcher(config?: Partial<WatcherConfig>): InboxWatcher;
//# sourceMappingURL=watcher.d.ts.map