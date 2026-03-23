import { Hono } from 'hono';

const health = new Hono();

const startedAt = Date.now();

health.get('/', (c) => {
  return c.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: Math.floor((Date.now() - startedAt) / 1000),
  });
});

export { health };
