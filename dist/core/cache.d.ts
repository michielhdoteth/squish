export declare function cacheGet<T>(key: string): Promise<T | null>;
export declare function cacheSet<T>(key: string, value: T, ttlMs?: number): Promise<void>;
export declare function cacheDel(key: string): Promise<void>;
export declare function cacheFlush(): Promise<void>;
export declare function checkRedisHealth(): Promise<boolean>;
export declare function closeCache(): Promise<void>;
//# sourceMappingURL=cache.d.ts.map