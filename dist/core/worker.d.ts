/**
 * Async Summarization Worker
 * Processes observations asynchronously for summarization and relevance scoring
 */
import Queue from 'bull';
declare const summaryQueue: Queue.Queue<any>;
export interface SummarizationJob {
    observationId: string;
    projectPath?: string;
    retries?: number;
}
export declare function processWorkerQueue(): Promise<void>;
export declare function queueForSummarization(observationId: string, projectPath?: string): Promise<void>;
export declare function getWorkerStats(): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
}>;
export declare function drainWorkerQueue(): Promise<void>;
export declare function checkWorkerHealth(): Promise<boolean>;
export { summaryQueue };
//# sourceMappingURL=worker.d.ts.map