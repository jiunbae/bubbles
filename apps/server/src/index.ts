import { Hono } from 'hono';
import { createBunWebSocket } from 'hono/bun';
import { config } from './config';
import { connectMongo, ensureIndexes, disconnectMongo } from './db/mongo';
import { corsMiddleware, isAllowedOrigin } from './middleware/cors';
import { health } from './routes/health';
import { places } from './routes/places';
import { logs } from './routes/logs';
import { createWSHandlers } from './ws/handler';
import { cleanupStaleRooms } from './ws/rooms';
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

  // Periodic cleanup of stale rooms
  const cleanupInterval = setInterval(cleanupStaleRooms, PLACE_INACTIVE_TIMEOUT / 2);

  // Graceful shutdown
  const shutdown = async () => {
    console.log('\n[shutdown] Shutting down gracefully...');
    clearInterval(cleanupInterval);
    await disconnectMongo();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  console.log(`[server] Bubbles server running on port ${config.PORT}`);
}

start();

export default {
  port: config.PORT,
  fetch: app.fetch,
  websocket,
};
