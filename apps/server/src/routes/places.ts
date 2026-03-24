import { Hono } from 'hono';
import { ObjectId } from 'mongodb';
import { getCollection } from '../db/mongo';
import { authMiddleware } from '../middleware/auth';
import { rateLimiterMiddleware } from '../middleware/rateLimiter';
import { getRoomUserCount } from '../ws/rooms';
import { logAction } from '../ws/actions';
import { MAX_PLACE_NAME_LENGTH } from '@bubbles/shared';

interface PlaceDoc {
  _id: ObjectId;
  name: string;
  theme: string;
  createdBy: string;
  totalVisitors: number;
  totalBubbles: number;
  createdAt: Date;
  lastActivityAt: Date;
  deleteAfter?: Date;
}

const places = new Hono();

places.use('*', authMiddleware);

// GET /places - list active places
places.get('/', async (c) => {
  const col = getCollection<PlaceDoc>('places');
  const docs = await col
    .find({ deleteAfter: { $exists: false } })
    .sort({ lastActivityAt: -1 })
    .limit(100)
    .toArray();

  const result = docs.map((doc) => ({
    id: doc._id.toHexString(),
    name: doc.name,
    theme: doc.theme || 'rooftop',
    createdBy: doc.createdBy,
    userCount: getRoomUserCount(doc._id.toHexString()),
    bubbleCount: 0,
    totalVisitors: doc.totalVisitors || 0,
    totalBubbles: doc.totalBubbles || 0,
    createdAt: doc.createdAt.toISOString(),
    lastActivityAt: doc.lastActivityAt.toISOString(),
  }));

  return c.json(result);
});

// POST /places - create a new place
places.post('/', rateLimiterMiddleware('createPlace'), async (c) => {
  const body = await c.req.json<{ name?: string; theme?: string }>();
  const user = c.get('user');

  if (!body.name || typeof body.name !== 'string') {
    return c.json({ error: 'Name is required' }, 400);
  }

  const name = body.name.trim();
  const validThemes = ['rooftop', 'park', 'alley'];
  const theme = validThemes.includes(body.theme ?? '') ? body.theme! : 'rooftop';
  if (name.length === 0 || name.length > MAX_PLACE_NAME_LENGTH) {
    return c.json(
      { error: `Name must be between 1 and ${MAX_PLACE_NAME_LENGTH} characters` },
      400
    );
  }

  const col = getCollection<PlaceDoc>('places');

  // If a place with this name is pending deletion, remove it first
  await col.deleteOne({ name, deleteAfter: { $exists: true } });

  // Check uniqueness among active places
  const existing = await col.findOne({ name, deleteAfter: { $exists: false } });
  if (existing) {
    return c.json({ error: 'A place with that name already exists' }, 409);
  }

  const now = new Date();
  const result = await col.insertOne({
    _id: new ObjectId(),
    name,
    theme,
    createdBy: user.displayName,
    totalVisitors: 0,
    totalBubbles: 0,
    createdAt: now,
    lastActivityAt: now,
  });

  const placeId = result.insertedId.toHexString();

  await logAction('create_place', placeId, user.sessionId, user, { name, theme });

  return c.json(
    {
      id: placeId,
      name,
      theme,
      createdBy: user.displayName,
      userCount: 0,
      bubbleCount: 0,
      totalVisitors: 0,
      totalBubbles: 0,
      createdAt: now.toISOString(),
      lastActivityAt: now.toISOString(),
    },
    201
  );
});

// GET /places/:placeId - get single place
places.get('/:placeId', async (c) => {
  const placeId = c.req.param('placeId');

  let objectId: ObjectId;
  try {
    objectId = new ObjectId(placeId);
  } catch {
    return c.json({ error: 'Invalid place ID' }, 400);
  }

  const col = getCollection<PlaceDoc>('places');
  const doc = await col.findOne({ _id: objectId });
  if (!doc) {
    return c.json({ error: 'Place not found' }, 404);
  }

  return c.json({
    id: doc._id.toHexString(),
    name: doc.name,
    theme: doc.theme || 'rooftop',
    createdBy: doc.createdBy,
    userCount: getRoomUserCount(placeId),
    bubbleCount: 0,
    totalVisitors: doc.totalVisitors || 0,
    totalBubbles: doc.totalBubbles || 0,
    createdAt: doc.createdAt.toISOString(),
    lastActivityAt: doc.lastActivityAt.toISOString(),
  });
});

export { places };
