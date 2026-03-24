import { Hono } from 'hono';
import { getRedis, isRedisEnabled } from '../db/redis';
import { getCollection } from '../db/mongo';

const health = new Hono();

let shuttingDown = false;

export function setShuttingDown(): void {
  shuttingDown = true;
}

export function isShuttingDown(): boolean {
  return shuttingDown;
}

// Liveness probe — always 200 unless process is broken
health.get('/', (c) => {
  return c.json({ status: 'ok' });
});

// Readiness probe — 503 when shutting down or dependencies are unreachable
health.get('/ready', async (c) => {
  if (shuttingDown) {
    return c.json({ status: 'shutting_down' }, 503);
  }

  const checks: Record<string, string> = {};

  // Check Redis connectivity (if enabled)
  if (isRedisEnabled()) {
    try {
      const redis = getRedis();
      if (!redis) {
        checks.redis = 'not_connected';
      } else {
        const pong = await Promise.race([
          redis.ping(),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000)),
        ]);
        checks.redis = pong === 'PONG' ? 'ok' : 'error';
      }
    } catch {
      checks.redis = 'error';
    }
  }

  // Check MongoDB connectivity
  try {
    const col = getCollection('places');
    await Promise.race([
      col.findOne({}, { projection: { _id: 1 } }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000)),
    ]);
    checks.mongo = 'ok';
  } catch {
    checks.mongo = 'error';
  }

  const allOk = Object.values(checks).every((v) => v === 'ok');
  if (!allOk) {
    return c.json({ status: 'degraded', checks }, 503);
  }

  return c.json({ status: 'ready', checks });
});

export { health };
