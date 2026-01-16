/**
 * Background Worker
 * Handles lifecycle maintenance, summarization, and other async tasks
 */
interface WorkerConfig {
    lifecycleInterval: number;
    pruningInterval: number;
    summarizationCheckInterval: number;
    associationPruningThreshold: number;
    summaryPruningAge: number;
}
declare class SquishWorker {
    private lifecycleTimer?;
    private pruningTimer?;
    private summarizationTimer?;
    private config;
    private isRunning;
    private stats;
    constructor(customConfig?: Partial<WorkerConfig>);
    start(): Promise<void>;
    stop(): Promise<void>;
    private scheduleLifecycleMaintenance;
    private runLifecycleMaintenance;
    private schedulePruning;
    private runPruning;
    private scheduleSummarizationCheck;
    private runSummarizationCheck;
    getStats(): {
        isRunning: boolean;
        stats: {
            lifecycleRuns: number;
            pruningRuns: number;
            summarizationRuns: number;
            lastLifecycleStats: any;
            lastAssociationStats: any;
            lastSummarizationStats: any;
        };
        config: WorkerConfig;
    };
    forceLifecycleMaintenance(projectId?: string): Promise<any>;
    forcePruning(): Promise<any>;
}
export declare function getWorker(customConfig?: Partial<WorkerConfig>): SquishWorker;
export declare function startWorker(): Promise<void>;
export declare function stopWorker(): Promise<void>;
export declare function getWorkerStats(): {
    isRunning: boolean;
    stats: {
        lifecycleRuns: number;
        pruningRuns: number;
        summarizationRuns: number;
        lastLifecycleStats: any;
        lastAssociationStats: any;
        lastSummarizationStats: any;
    };
    config: WorkerConfig;
} | null;
export declare function forceLifecycleMaintenance(projectId?: string): Promise<any>;
export declare function forcePruning(): Promise<any>;
export type { WorkerConfig };
export { SquishWorker };
//# sourceMappingURL=worker.d.ts.map