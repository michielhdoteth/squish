import { createClient, RedisClientType } from 'redis';
import { performRedisPublish } from './utils/memory-operations.js';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

let client: RedisClientType | null = null;

export async function getRedisClient(): Promise<RedisClientType> {
  if (client && client.isOpen) {
    return client;
  }

  client = createClient({ url: REDIS_URL });

  client.on('error', (err) => {
    console.error('Redis client error:', err);
  });

  client.on('connect', () => {
    console.error('Redis connected');
  });

  await client.connect();
  return client;
}

export async function closeRedisConnection(): Promise<void> {
  if (client && client.isOpen) {
    await client.quit();
    client = null;
  }
}

// Cache helpers with TTL
export async function cacheGet<T>(key: string): Promise<T | null> {
  const redis = await getRedisClient();
  const value = await redis.get(key);
  return value ? JSON.parse(value) : null;
}

export async function cacheSet<T>(key: string, value: T, ttlSeconds: number = 300): Promise<void> {
  const redis = await getRedisClient();
  await redis.setEx(key, ttlSeconds, JSON.stringify(value));
}

export async function cacheDelete(key: string): Promise<void> {
  const redis = await getRedisClient();
  await redis.del(key);
}

export async function cacheClear(pattern: string): Promise<void> {
  const redis = await getRedisClient();
  const keys = await redis.keys(pattern);
  if (keys.length > 0) {
    await redis.del(keys);
  }
}

// Pub/Sub for real-time sync
export async function publish(channel: string, message: unknown): Promise<void> {
  await performRedisPublish(getRedisClient, channel, message);
}

export async function subscribe(channel: string, callback: (message: unknown) => void): Promise<void> {
  const subscriber = (await getRedisClient()).duplicate();
  await subscriber.connect();
  await subscriber.subscribe(channel, (message) => {
    callback(JSON.parse(message));
  });
}

// Check Redis health
export async function checkRedisHealth(): Promise<boolean> {
  try {
    const redis = await getRedisClient();
    const pong = await redis.ping();
    return pong === 'PONG';
  } catch {
    return false;
  }
}
