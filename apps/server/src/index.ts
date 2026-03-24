import { Hono } from 'hono';
import { createBunWebSocket } from 'hono/bun';
import { config } from './config';
import { connectMongo, ensureIndexes, disconnectMongo } from './db/mongo';
import { connectRedis, disconnectRedis } from './db/redis';
import { corsMiddleware, isAllowedOrigin } from './middleware/cors';
import { health, setShuttingDown } from './routes/health';
import { auth } from './routes/auth';
import { places } from './routes/places';
import { logs } from './routes/logs';
import { createWSHandlers, getAllSessions } from './ws/handler';
import { cleanupStaleRooms, cleanupRedisStaleEntries } from './ws/rooms';
import { initPubSub } from './ws/pubsub';
import { PLACE_INACTIVE_TIMEOUT } from '@bubbles/shared';
import { metricsMiddleware, metricsRoute } from './metrics';

const app = new Hono();
const { upgradeWebSocket, websocket } = createBunWebSocket();

// Global middleware
app.use('*', corsMiddleware);
app.use('*', metricsMiddleware);

// Routes
app.route('/metrics', metricsRoute);
app.route('/health', health);
app.route('/auth', auth);
app.route('/places', places);
app.route('', logs);

// WebSocket endpoint with Origin validation
app.get(
  '/ws/place/:placeId',
  (c, next) => {
    const origin = c.req.header('Origin');
    if (origin && !isAllowedOrigin(origin)) {
      return c.text('Forbidden', 403);
    }
    return next();
  },
  upgradeWebSocket((c) => {
    const placeId = c.req.param('placeId') ?? '';
    return createWSHandlers(placeId, c);
  })
);

// Startup
async function start() {
  try {
    await connectMongo();
    await ensureIndexes();
  } catch (err) {
    console.error('[startup] Failed to connect to MongoDB:', err);
    process.exit(1);
  }

  // Connect Redis (optional — runs without it)
  connectRedis();
  initPubSub();

  // Periodic cleanup of stale rooms
  const cleanupInterval = setInterval(cleanupStaleRooms, PLACE_INACTIVE_TIMEOUT / 2);

  // Periodic Redis stale entry cleanup (every 5 minutes)
  const redisCleanupInterval = setInterval(cleanupRedisStaleEntries, 5 * 60 * 1000);

  // Graceful shutdown
  let isShuttingDown = false;
  const shutdown = async () => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    console.log('\n[shutdown] Shutting down gracefully...');
    setShuttingDown(); // readiness probe returns 503

    // Close all WebSocket connections with code 1012 (Service Restart)
    const sessions = getAllSessions();
    console.log(`[shutdown] Closing ${sessions.size} WebSocket connections...`);
    for (const [, session] of sessions) {
      try {
        session.ws.close(1012, 'Server restarting');
      } catch {
        // already closed
      }
    }

    // Wait for close frames to flush
    await new Promise((resolve) => setTimeout(resolve, 2000));

    clearInterval(cleanupInterval);
    clearInterval(redisCleanupInterval);
    await disconnectRedis();
    await disconnectMongo();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  console.log(`[server] Bubbles server running on port ${config.PORT} (pod: ${config.POD_ID})`);
}

start();

export default {
  port: config.PORT,
  fetch: app.fetch,
  websocket,
};
