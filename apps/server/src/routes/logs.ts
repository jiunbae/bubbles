import { Hono } from 'hono';
import { ObjectId } from 'mongodb';
import { getCollection } from '../db/mongo';
import { authMiddleware } from '../middleware/auth';

interface ActionLogDoc {
  _id: ObjectId;
  action: string;
  placeId: string;
  sessionId: string;
  displayName: string;
  isAuthenticated: boolean;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

const logs = new Hono();

logs.use('*', authMiddleware);

// GET /places/:placeId/logs - paginated action logs for a place
logs.get('/places/:placeId/logs', async (c) => {
  const placeId = c.req.param('placeId');
  const limit = Math.min(parseInt(c.req.query('limit') || '50', 10), 100);
  const before = c.req.query('before'); // cursor-based pagination

  const col = getCollection<ActionLogDoc>('action_logs');
  const query: Record<string, unknown> = { placeId };

  if (before) {
    try {
      query._id = { $lt: new ObjectId(before) };
    } catch {
      return c.json({ error: 'Invalid cursor' }, 400);
    }
  }

  const docs = await col.find(query).sort({ createdAt: -1 }).limit(limit).toArray();

  const result = docs.map((doc) => ({
    id: doc._id.toHexString(),
    action: doc.action,
    placeId: doc.placeId,
    displayName: doc.displayName,
    metadata: doc.metadata,
    createdAt: doc.createdAt.toISOString(),
  }));

  return c.json({
    logs: result,
    hasMore: docs.length === limit,
    nextCursor: docs.length > 0 ? docs[docs.length - 1]._id.toHexString() : null,
  });
});

// GET /logs/me - current user's action logs
logs.get('/me', async (c) => {
  const user = c.get('user');
  const limit = Math.min(parseInt(c.req.query('limit') || '50', 10), 100);
  const before = c.req.query('before');

  const col = getCollection<ActionLogDoc>('action_logs');
  const query: Record<string, unknown> = { sessionId: user.sessionId };

  if (before) {
    try {
      query._id = { $lt: new ObjectId(before) };
    } catch {
      return c.json({ error: 'Invalid cursor' }, 400);
    }
  }

  const docs = await col.find(query).sort({ createdAt: -1 }).limit(limit).toArray();

  const result = docs.map((doc) => ({
    id: doc._id.toHexString(),
    action: doc.action,
    placeId: doc.placeId,
    displayName: doc.displayName,
    metadata: doc.metadata,
    createdAt: doc.createdAt.toISOString(),
  }));

  return c.json({
    logs: result,
    hasMore: docs.length === limit,
    nextCursor: docs.length > 0 ? docs[docs.length - 1]._id.toHexString() : null,
  });
});

export { logs };
