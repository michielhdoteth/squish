import { config } from '../config.js';
let redis = null;
const memoryCache = new Map();
async function initRedis() {
    if (!config.redisEnabled)
        return null;
    if (redis)
        return redis;
    try {
        const { createClient } = await import('redis');
        redis = createClient({ url: process.env.REDIS_URL });
        await redis.connect();
        console.log('Redis connected');
        return redis;
    }
    catch (error) {
        console.error('Failed to connect to Redis, using memory cache:', error);
        redis = null;
        return null;
    }
}
export async function cacheGet(key) {
    try {
        const r = await initRedis();
        if (r) {
            const value = await r.get(key);
            return value ? JSON.parse(value) : null;
        }
    }
    catch (error) {
        console.error('Redis GET failed, falling back to memory:', error);
    }
    // Memory cache fallback
    const item = memoryCache.get(key);
    if (item && item.expires > Date.now()) {
        return item.value;
    }
    memoryCache.delete(key);
    return null;
}
export async function cacheSet(key, value, ttlMs = 3600000) {
    try {
        const r = await initRedis();
        if (r) {
            await r.setEx(key, Math.floor(ttlMs / 1000), JSON.stringify(value));
            return;
        }
    }
    catch (error) {
        console.error('Redis SET failed, falling back to memory:', error);
    }
    // Memory cache fallback
    memoryCache.set(key, { value, expires: Date.now() + ttlMs });
}
export async function cacheDel(key) {
    try {
        const r = await initRedis();
        if (r) {
            await r.del(key);
            return;
        }
    }
    catch (error) {
        console.error('Redis DEL failed, falling back to memory:', error);
    }
    // Memory cache fallback
    memoryCache.delete(key);
}
export async function cacheFlush() {
    try {
        const r = await initRedis();
        if (r) {
            await r.flushDb();
            return;
        }
    }
    catch (error) {
        console.error('Redis FLUSH failed, falling back to memory:', error);
    }
    // Memory cache fallback
    memoryCache.clear();
}
export async function checkRedisHealth() {
    if (!config.redisEnabled)
        return true;
    try {
        const r = await initRedis();
        if (!r)
            return false;
        const pong = await r.ping();
        return pong === 'PONG';
    }
    catch (error) {
        console.error('Redis health check failed:', error);
        return false;
    }
}
export async function closeCache() {
    if (redis) {
        await redis.quit();
        redis = null;
    }
    memoryCache.clear();
}
//# sourceMappingURL=cache.js.map