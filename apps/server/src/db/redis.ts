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
    // Never stop reconnecting. Returning a non-number here makes ioredis give
    // up permanently, and nothing brings the client back: /health stays 200 so
    // the kubelet never restarts the pod, while /health/ready keeps failing on
    // the dead client. A Redis restart longer than the retry budget then wedges
    // the pod at 0/1 forever. Cap the backoff instead of bounding the attempts.
    retryStrategy(times: number) {
      return Math.min(times * 200, 5000);
    },
  };

  redis = new Redis(config.REDIS_URL, sharedOptions);
  sub = new Redis(config.REDIS_URL, sharedOptions);

  redis.on('error', (err) => log.error('Command connection error', { err: err.message }));
  sub.on('error', (err) => log.error('Sub connection error', { err: err.message }));
  redis.on('connect', () => log.info('Command connection established'));
  sub.on('connect', () => log.info('Sub connection established'));
  // A silent, permanently-closed client is what made the previous outage hard
  // to see: surface every reconnect attempt and every terminal close.
  redis.on('reconnecting', (delay: number) => log.warn('Command connection reconnecting', { delay }));
  sub.on('reconnecting', (delay: number) => log.warn('Sub connection reconnecting', { delay }));
  redis.on('end', () => log.error('Command connection closed and will not retry'));
  sub.on('end', () => log.error('Sub connection closed and will not retry'));
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
