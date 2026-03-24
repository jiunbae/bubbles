import { Hono } from 'hono';

const health = new Hono();

const startedAt = Date.now();
let shuttingDown = false;

export function setShuttingDown(): void {
  shuttingDown = true;
}

export function isShuttingDown(): boolean {
  return shuttingDown;
}

// Liveness probe — always 200 unless process is broken
health.get('/', (c) => {
  return c.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: Math.floor((Date.now() - startedAt) / 1000),
  });
});

// Readiness probe — 503 when shutting down (K8s removes from service endpoints)
health.get('/ready', (c) => {
  if (shuttingDown) {
    return c.json({ status: 'shutting_down' }, 503);
  }
  return c.json({ status: 'ready' });
});

export { health };
