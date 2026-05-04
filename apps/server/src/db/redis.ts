import Redis from 'ioredis';
import { config } from '../config';
import { createLogger } from '../logger';

const log = createLogger('redis');

let redis: Redis | null = null;
let sub: Redis | null = null;

export function isRedisEnabled(): boolean {
  return !!config.REDIS_URL;
}

export function connectRedis(): void {
  if (!config.REDIS_URL) {
    log.info('No REDIS_URL configured, running in local-only mode');
    return;
  }

  const sharedOptions = {
    maxRetriesPerRequest: 3,
    lazyConnect: false,
    retryStrategy(times: number) {
      if (times > 10) return null;
      return Math.min(times * 200, 2000);
    },
  };

  redis = new Redis(config.REDIS_URL, sharedOptions);
  sub = new Redis(config.REDIS_URL, sharedOptions);

  redis.on('error', (err) => log.error('Command connection error', { err: err.message }));
  sub.on('error', (err) => log.error('Sub connection error', { err: err.message }));
  redis.on('connect', () => log.info('Command connection established'));
  sub.on('connect', () => log.info('Sub connection established'));
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
