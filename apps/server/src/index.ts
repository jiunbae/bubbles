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
import { createWSHandlers, getAllSessions, cleanupStaleCursors } from './ws/handler';
import { leaveRoom } from './ws/rooms';
import { cleanupStaleRooms, cleanupRedisStaleEntries } from './ws/rooms';
import { initPubSub } from './ws/pubsub';
import { PLACE_INACTIVE_TIMEOUT } from '@bubbles/shared';
import { metricsMiddleware, metricsRoute } from './metrics';
import { og } from './routes/og';

const app = new Hono();
const { upgradeWebSocket, websocket } = createBunWebSocket();

// Global middleware
app.use('*', corsMiddleware);
app.use('*', metricsMiddleware);

// Metrics route — guard against public access
// Block requests with X-Forwarded-For (coming through public ingress)
app.use('/metrics/*', async (c, next) => {
  const metricsToken = process.env.METRICS_TOKEN;
  const forwarded = c.req.header('X-Forwarded-For');

  // If request came through a proxy (public ingress), require token auth
  if (forwarded) {
    if (!metricsToken) {
      return c.text('Forbidden', 403);
    }
    const auth = c.req.header('Authorization');
    if (auth !== `Bearer ${metricsToken}`) {
      return c.text('Forbidden', 403);
    }
  }

  return next();
});

// Routes
app.route('/metrics', metricsRoute);
app.route('/health', health);
app.route('/auth', auth);
app.route('/og', og);
app.route('/places', places);
app.route('', logs);

// WebSocket endpoint with Origin + placeId validation
app.get(
  '/ws/place/:placeId',
  (c, next) => {
    const origin = c.req.header('Origin');
    if (origin && !isAllowedOrigin(origin)) {
      return c.text('Forbidden', 403);
    }

    // Validate placeId is a 24-char hex string (MongoDB ObjectId format)
    const placeId = c.req.param('placeId') ?? '';
    if (!/^[0-9a-fA-F]{24}$/.test(placeId)) {
      return c.text('Bad Request: invalid placeId', 400);
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

  // Periodic cleanup of stale rooms and orphaned cursor entries
  const cleanupInterval = setInterval(() => {
    cleanupStaleRooms();
    cleanupStaleCursors();
  }, PLACE_INACTIVE_TIMEOUT / 2);

  // Periodic Redis stale entry cleanup (every 5 minutes)
  const redisCleanupInterval = setInterval(cleanupRedisStaleEntries, 5 * 60 * 1000);

  // Graceful shutdown
  let isShuttingDown = false;
  const shutdown = async () => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    console.log('\n[shutdown] Shutting down gracefully...');
    setShuttingDown(); // readiness probe returns 503

    // Clean up all sessions: leave rooms (removes from Redis) then close WS
    const sessions = getAllSessions();
    console.log(`[shutdown] Cleaning up ${sessions.size} WebSocket sessions...`);
    for (const [sessionId, session] of sessions) {
      try {
        leaveRoom(session.placeId, sessionId);
      } catch {
        // best-effort cleanup
      }
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
