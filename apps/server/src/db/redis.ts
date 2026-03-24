import Redis from 'ioredis';
import { config } from '../config';

let redis: Redis | null = null;
let sub: Redis | null = null;

export function isRedisEnabled(): boolean {
  return !!config.REDIS_URL;
}

export function connectRedis(): void {
  if (!config.REDIS_URL) {
    console.log('[redis] No REDIS_URL configured, running in local-only mode');
    return;
  }

  redis = new Redis(config.REDIS_URL, {
    maxRetriesPerRequest: 3,
    lazyConnect: false,
    retryStrategy(times) {
      if (times > 10) return null;
      return Math.min(times * 200, 2000);
    },
  });

  sub = new Redis(config.REDIS_URL, {
    maxRetriesPerRequest: 3,
    lazyConnect: false,
    retryStrategy(times) {
      if (times > 10) return null;
      return Math.min(times * 200, 2000);
    },
  });

  redis.on('error', (err) => console.error('[redis] Command connection error:', err.message));
  sub.on('error', (err) => console.error('[redis] Sub connection error:', err.message));
  redis.on('connect', () => console.log('[redis] Command connection established'));
  sub.on('connect', () => console.log('[redis] Sub connection established'));
}

export function getRedis(): Redis | null {
  return redis;
}

export function getSub(): Redis | null {
  return sub;
}

export async function disconnectRedis(): Promise<void> {
  if (redis) {
    await redis.quit().catch(() => {});
    redis = null;
  }
  if (sub) {
    await sub.quit().catch(() => {});
    sub = null;
  }
}
