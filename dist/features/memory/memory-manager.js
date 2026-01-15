// Memory monitoring and optimization
class MemoryManager {
    lastGcTime = 0;
    gcIntervalMs = 5 * 60 * 1000; // 5 minutes
    shouldGc() {
        const now = Date.now();
        if (now - this.lastGcTime > this.gcIntervalMs) {
            const usage = process.memoryUsage();
            const heapUsedMB = usage.heapUsed / 1024 / 1024;
            const heapTotalMB = usage.heapTotal / 1024 / 1024;
            // Trigger GC if heap usage is high (>80% of total)
            if (heapUsedMB > heapTotalMB * 0.8) {
                this.lastGcTime = now;
                return true;
            }
        }
        return false;
    }
    gc() {
        if (global.gc && this.shouldGc()) {
            if (process.env.NODE_ENV !== 'production') {
                console.log('[squish] Running garbage collection');
            }
            global.gc();
        }
    }
    getStats() {
        const usage = process.memoryUsage();
        return {
            heapUsed: Math.round(usage.heapUsed / 1024 / 1024),
            heapTotal: Math.round(usage.heapTotal / 1024 / 1024),
            external: Math.round(usage.external / 1024 / 1024),
            rss: Math.round(usage.rss / 1024 / 1024),
        };
    }
}
export const memoryManager = new MemoryManager();
// Periodic memory monitoring (production-safe)
if (process.env.NODE_ENV !== 'production') {
    setInterval(() => {
        const stats = memoryManager.getStats();
        console.log(`[squish] Memory: ${stats.heapUsed}MB used, ${stats.heapTotal}MB total`);
    }, 10 * 60 * 1000); // Every 10 minutes
}
//# sourceMappingURL=memory-manager.js.map