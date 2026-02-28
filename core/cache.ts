import { config } from '../config.js';
import { logger } from './logger.js';

let redis: any = null;

// v0.4.2: LRU Cache with configurable size limits and TTL
interface CacheEntry<T> {
  value: T;
  expires: number;
  lastAccessed: number;
}

class LRUCache {
  private cache = new Map<string, CacheEntry<unknown>>();
  private maxSize: number;
  private maxSizeBytes: number;
  private currentSizeBytes: number = 0;
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(maxSize: number = 1000, maxSizeBytes: number = 50 * 1024 * 1024) {
    this.maxSize = maxSize;
    this.maxSizeBytes = maxSizeBytes; // 50MB default
    this.startCleanupTimer();
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);

    if (!entry) return null;

    // Check expiration
    if (entry.expires < Date.now()) {
      this.delete(key);
      return null;
    }

    // Update LRU access time
    entry.lastAccessed = Date.now();

    return entry.value as T;
  }

  set<T>(key: string, value: T, ttlMs: number = 3600000): void {
    const size = this.estimateSize(value);

    // Evict if needed
    while (
      (this.cache.size >= this.maxSize || this.currentSizeBytes + size > this.maxSizeBytes) &&
      this.cache.size > 0
    ) {
      this.evictLRU();
    }

    // Delete old entry if exists
    if (this.cache.has(key)) {
      this.delete(key);
    }

    // Add new entry
    this.cache.set(key, {
      value,
      expires: Date.now() + ttlMs,
      lastAccessed: Date.now(),
    });

    this.currentSizeBytes += size;
  }

  delete(key: string): boolean {
    const entry = this.cache.get(key);
    if (entry) {
      const size = this.estimateSize(entry.value);
      this.currentSizeBytes = Math.max(0, this.currentSizeBytes - size);
    }
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
    this.currentSizeBytes = 0;
  }

  size(): number {
    return this.cache.size;
  }

  sizeBytes(): number {
    return this.currentSizeBytes;
  }

  private evictLRU(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      logger.debug('Evicting LRU cache entry', { key: oldestKey });
      this.delete(oldestKey);
    }
  }

  private estimateSize(value: unknown): number {
    try {
      return JSON.stringify(value).length * 2; // UTF-16, rough estimate
    } catch {
      return 1024; // Default 1KB for non-serializable objects
    }
  }

  private cleanup(): void {
    const now = Date.now();
    const toDelete: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      if (entry.expires < now) {
        toDelete.push(key);
      }
    }

    for (const key of toDelete) {
      this.delete(key);
    }

    if (toDelete.length > 0) {
      logger.debug('Cache cleanup removed expired entries', { count: toDelete.length });
    }
  }

  private startCleanupTimer(): void {
    // Cleanup every 5 minutes
    this.cleanupTimer = setInterval(() => this.cleanup(), 5 * 60 * 1000);

    // Prevent timer from keeping process alive
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }

  stopCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  getStats() {
    return {
      entries: this.cache.size,
      sizeBytes: this.currentSizeBytes,
      maxSize: this.maxSize,
      maxSizeBytes: this.maxSizeBytes,
      utilizationPercent: (this.cache.size / this.maxSize) * 100,
      memoryUtilizationPercent: (this.currentSizeBytes / this.maxSizeBytes) * 100,
    };
  }
}

// Create LRU cache with configurable limits
const memoryCache = new LRUCache(
  parseInt(process.env.SQUISH_CACHE_MAX_ENTRIES || '1000'),
  parseInt(process.env.SQUISH_CACHE_MAX_BYTES || '52428800') // 50MB
);

async function initRedis() {
  if (!config.redisEnabled) return null;
  if (redis) return redis;

  try {
    const { createClient } = await import('redis');
    redis = createClient({ url: process.env.REDIS_URL });
    await redis.connect();
    logger.info('Redis connected');
    return redis;
  } catch (error) {
    logger.error('Failed to connect to Redis, using memory cache', error);
    redis = null;
    return null;
  }
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const r = await initRedis();
    if (r) {
      const value = await r.get(key);
      return value ? (JSON.parse(value) as T) : null;
    }
  } catch (error) {
    logger.error('Redis GET failed, falling back to memory', error);
  }

  // Memory cache fallback with LRU
  return memoryCache.get<T>(key);
}

export async function cacheSet<T>(key: string, value: T, ttlMs: number = 3600000): Promise<void> {
  try {
    const r = await initRedis();
    if (r) {
      await r.setEx(key, Math.floor(ttlMs / 1000), JSON.stringify(value));
      return;
    }
  } catch (error) {
    logger.error('Redis SET failed, falling back to memory', error);
  }

  // Memory cache fallback with LRU
  memoryCache.set(key, value, ttlMs);
}

export function getCacheStats() {
  return memoryCache.getStats();
}

export async function closeCache(): Promise<void> {
  if (redis) {
    await redis.quit();
    redis = null;
  }
  memoryCache.stopCleanupTimer();
  memoryCache.clear();
}

export async function checkRedisHealth(): Promise<boolean> {
  if (!config.redisEnabled) return true;
  try {
    const r = await initRedis();
    if (!r) return false;
    const pong = await r.ping();
    return pong === 'PONG';
  } catch (error) {
    logger.error('Redis health check failed', error);
    return false;
  }
}
