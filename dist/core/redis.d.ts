import { RedisClientType } from 'redis';
export declare function getRedisClient(): Promise<RedisClientType>;
export declare function closeRedisConnection(): Promise<void>;
export declare function cacheGet<T>(key: string): Promise<T | null>;
export declare function cacheSet<T>(key: string, value: T, ttlSeconds?: number): Promise<void>;
export declare function cacheDelete(key: string): Promise<void>;
export declare function cacheClear(pattern: string): Promise<void>;
export declare function publish(channel: string, message: unknown): Promise<void>;
export declare function subscribe(channel: string, callback: (message: unknown) => void): Promise<void>;
export declare function checkRedisHealth(): Promise<boolean>;
//# sourceMappingURL=redis.d.ts.map