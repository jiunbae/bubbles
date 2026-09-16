import { Hono } from 'hono';
import { getRedis, getSub, isRedisEnabled } from '../db/redis';
import { getCollection } from '../db/mongo';

const health = new Hono();

let shuttingDown = false;

export function setShuttingDown(): void {
  shuttingDown = true;
}

export function isShuttingDown(): boolean {
  return shuttingDown;
}

// Startup probe — 200 as soon as the process serves HTTP. Deliberately knows
// nothing about dependencies: it only answers "has the runtime come up".
health.get('/', (c) => {
  return c.json({ status: 'ok' });
});

// Liveness probe — 503 only for states the process cannot recover from.
//
// It must not follow dependency outages. Restarting every replica because
// Redis blinked converts a blip into an outage, and the server's own startup
// waits on Mongo, so a dependency-checking liveness probe would guarantee a
// crash storm. The one thing worth a restart is an ioredis client that has
// closed for good: it never reconnects, readiness then fails forever, and on
// 2026-09-12 that wedged both pods for 237 minutes because liveness kept
// answering 200. Configure the kubelet against this path, not against `/`.
health.get('/live', (c) => {
  if (shuttingDown) {
    return c.json({ status: 'shutting_down' });
  }

  const dead = [getRedis(), getSub()]
    .filter((client): client is NonNullable<typeof client> => client !== null)
    .some((client) => client.status === 'end');

  if (dead) {
    return c.json({ status: 'unrecoverable', reason: 'redis_client_closed' }, 503);
  }

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
