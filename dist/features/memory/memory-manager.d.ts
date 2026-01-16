declare class MemoryManager {
    private lastGcTime;
    private gcIntervalMs;
    shouldGc(): boolean;
    gc(): void;
    getStats(): {
        heapUsed: number;
        heapTotal: number;
        external: number;
        rss: number;
    };
}
export declare const memoryManager: MemoryManager;
export {};
//# sourceMappingURL=memory-manager.d.ts.map