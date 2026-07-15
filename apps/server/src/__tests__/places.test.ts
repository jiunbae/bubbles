import { describe, it, expect, beforeAll, beforeEach, mock } from 'bun:test';
import { Hono } from 'hono';
import { ObjectId } from 'mongodb';
import { SignJWT } from 'jose';

// In-memory mock data
const mockPlaces: any[] = [];

const mockCollection = {
  find: (filter: any) => ({
    sort: () => ({
      limit: () => ({
        toArray: async () => {
          return mockPlaces.filter((p) => {
            if (!filter?.$or) return true;
            // Active places: no deleteAfter or deleteAfter > now
            return !p.deleteAfter || p.deleteAfter > new Date();
          });
        },
      }),
    }),
  }),
  findOne: async (filter: any) => {
    if (filter?._id) {
      return mockPlaces.find((p) => p._id.equals(filter._id)) || null;
    }
    if (filter?.name) {
      return mockPlaces.find((p) => p.name === filter.name) || null;
    }
    return null;
  },
  insertOne: async (doc: any) => {
    mockPlaces.push(doc);
    return { insertedId: doc._id };
  },
  deleteOne: async (filter: any) => {
    const idx = mockPlaces.findIndex((p) => {
      if (filter?.name && p.name !== filter.name) return false;
      if (filter?.deleteAfter?.$lte) {
        if (!p.deleteAfter) return false;
        if (p.deleteAfter > filter.deleteAfter.$lte) return false;
      }
      return true;
    });
    if (idx >= 0) {
      mockPlaces.splice(idx, 1);
      return { deletedCount: 1 };
    }
    return { deletedCount: 0 };
  },
  updateOne: async (filter: any, update: any) => {
    const place = mockPlaces.find(
      (p) => filter?._id && p._id.equals(filter._id)
    );
    if (place) {
      if (update?.$set) Object.assign(place, update.$set);
      if (update?.$unset) {
        for (const key of Object.keys(update.$unset))
          delete (place as any)[key];
      }
      if (update?.$inc) {
        for (const [key, val] of Object.entries(update.$inc)) {
          (place as any)[key] = ((place as any)[key] || 0) + (val as number);
        }
      }
    }
    return { modifiedCount: place ? 1 : 0 };
  },
};

// Set up module mocks before importing places
mock.module('../db/mongo', () => ({
  connectMongo: async () => {},
  getDb: () => ({ collection: () => mockCollection }),
  getCollection: () => mockCollection,
  ensureIndexes: async () => {},
  disconnectMongo: async () => {},
}));

mock.module('../ws/rooms', () => ({
  getRoomUserCountAsync: async () => 0,
  getRoomUserCountsBatch: async (ids: string[]) => {
    const map = new Map<string, number>();
    for (const id of ids) map.set(id, 0);
    return map;
  },
}));

mock.module('../ws/actions', () => ({
  logAction: async () => {},
}));

let places: any;

async function authToken(subject: string, name: string): Promise<string> {
  const secret = new TextEncoder().encode(process.env.JWT_SECRET!);
  return new SignJWT({ sub: subject, name })
    .setProtectedHeader({ alg: 'HS256' })
    .sign(secret);
}

function expectPrivateOwnershipResponse(res: Response): void {
  expect(res.headers.get('Cache-Control')).toBe('private, no-store');
  expect(res.headers.get('Vary')).toBe('Authorization, Cookie');
}

describe('places routes', () => {
  beforeAll(async () => {
    const mod = await import('../routes/places');
    places = mod.places;
  });

  beforeEach(() => {
    mockPlaces.length = 0;
  });

  it('GET /places returns active places', async () => {
    const now = new Date();
    const placeId = new ObjectId();
    mockPlaces.push({
      _id: placeId,
      name: 'Test Place',
      theme: 'rooftop',
      createdBy: 'Tester',
      totalVisitors: 0,
      totalBubbles: 0,
      createdAt: now,
      lastActivityAt: now,
    });

    const app = new Hono();
    app.route('/places', places);

    const res = await app.fetch(new Request('http://localhost/places'));
    expect(res.status).toBe(200);
    expectPrivateOwnershipResponse(res);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].name).toBe('Test Place');
    expect(body[0].id).toBe(placeId.toHexString());
  });

  it('POST /places creates a place with valid name', async () => {
    const app = new Hono();
    app.route('/places', places);

    const res = await app.fetch(
      new Request('http://localhost/places', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'New Place', theme: 'park' }),
      })
    );
    expect(res.status).toBe(201);
    expectPrivateOwnershipResponse(res);
    const body = await res.json();
    expect(body.name).toBe('New Place');
    expect(body.theme).toBe('park');
    expect(body.id).toBeDefined();
    expect(body.createdBy).toBeDefined();
    expect(body.ownerId).toBeUndefined();
    expect(mockPlaces[0].ownerId).toStartWith('owner_v1_');
    expect(body.isOwnedByCurrentUser).toBe(true);
  });

  it('recognizes an anonymous owner only with the same signed session cookie', async () => {
    const app = new Hono();
    app.route('/places', places);

    const created = await app.fetch(
      new Request('http://localhost/places', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Anonymous Place' }),
      })
    );
    expect(created.status).toBe(201);
    const createdBody = await created.json();
    expect(createdBody.ownerId).toBeUndefined();
    expect(mockPlaces[0].ownerId).toStartWith('owner_v1_');
    const setCookie = created.headers.get('Set-Cookie') || '';
    const sessionCookie = setCookie.match(/bubbles_session=([^;]+)/)?.[1];
    expect(sessionCookie).toBeDefined();

    const owned = await app.fetch(
      new Request('http://localhost/places', {
        headers: { Cookie: `bubbles_session=${sessionCookie}` },
      })
    );
    const ownedBody = await owned.json();
    expect(ownedBody[0].ownerId).toBeUndefined();
    expect(ownedBody[0].isOwnedByCurrentUser).toBe(true);

    const otherSession = await app.fetch(
      new Request('http://localhost/places')
    );
    const otherBody = await otherSession.json();
    expect(otherBody[0].isOwnedByCurrentUser).toBe(false);
  });

  it('uses the account subject instead of session or display name', async () => {
    const app = new Hono();
    app.route('/places', places);
    const creatorToken = await authToken('account-1', 'Alice');

    const created = await app.fetch(
      new Request('http://localhost/places', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${creatorToken}`,
        },
        body: JSON.stringify({ name: 'Authenticated Place' }),
      })
    );
    expect(created.status).toBe(201);
    const createdBody = await created.json();
    expect(createdBody.ownerId).toBeUndefined();
    const storedOwnerId = mockPlaces[0].ownerId;

    const renamedToken = await authToken('account-1', 'Renamed Alice');
    const renamed = await app.fetch(
      new Request('http://localhost/places', {
        headers: { Authorization: `Bearer ${renamedToken}` },
      })
    );
    const renamedBody = await renamed.json();
    expect(renamedBody[0].ownerId).toBeUndefined();
    expect(mockPlaces[0].ownerId).toBe(storedOwnerId);
    expect(renamedBody[0].isOwnedByCurrentUser).toBe(true);

    const sameNameToken = await authToken('account-2', 'Alice');
    const sameName = await app.fetch(
      new Request('http://localhost/places', {
        headers: { Authorization: `Bearer ${sameNameToken}` },
      })
    );
    const sameNameBody = await sameName.json();
    expect(sameNameBody[0].isOwnedByCurrentUser).toBe(false);
  });

  it('keeps display-name detection for ownerless legacy documents', async () => {
    const now = new Date();
    mockPlaces.push({
      _id: new ObjectId(),
      name: 'Legacy Place',
      theme: 'rooftop',
      createdBy: 'Legacy Alice',
      totalVisitors: 0,
      totalBubbles: 0,
      createdAt: now,
      lastActivityAt: now,
    });
    const token = await authToken('legacy-account', 'Legacy Alice');
    const app = new Hono();
    app.route('/places', places);

    const res = await app.fetch(
      new Request('http://localhost/places', {
        headers: { Authorization: `Bearer ${token}` },
      })
    );
    const body = await res.json();
    expect(body[0].ownerId).toBeUndefined();
    expect(body[0].isOwnedByCurrentUser).toBe(true);
  });

  it('POST /places rejects duplicate names', async () => {
    const now = new Date();
    const placeId = new ObjectId();
    mockPlaces.push({
      _id: placeId,
      name: 'Duplicate Place',
      theme: 'rooftop',
      createdBy: 'Tester',
      totalVisitors: 0,
      totalBubbles: 0,
      createdAt: now,
      lastActivityAt: now,
    });

    const app = new Hono();
    app.route('/places', places);

    const res = await app.fetch(
      new Request('http://localhost/places', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Duplicate Place' }),
      })
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('A place with that name already exists');
  });

  it('POST /places sanitizes HTML in names', async () => {
    const app = new Hono();
    app.route('/places', places);

    const res = await app.fetch(
      new Request('http://localhost/places', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: '<b>Bad</b> Place' }),
      })
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.name).not.toContain('<');
    expect(body.name).not.toContain('>');
    expect(body.name).toBe('bBad/b Place');
  });

  it('GET /places/:placeId returns a place', async () => {
    const now = new Date();
    const placeId = new ObjectId();
    mockPlaces.push({
      _id: placeId,
      name: 'Single Place',
      theme: 'alley',
      createdBy: 'Tester',
      totalVisitors: 0,
      totalBubbles: 0,
      createdAt: now,
      lastActivityAt: now,
    });

    const app = new Hono();
    app.route('/places', places);

    const res = await app.fetch(
      new Request(`http://localhost/places/${placeId.toHexString()}`)
    );
    expect(res.status).toBe(200);
    expectPrivateOwnershipResponse(res);
    const body = await res.json();
    expect(body.name).toBe('Single Place');
    expect(body.theme).toBe('alley');
  });

  it('GET /places/:placeId returns 404 for nonexistent', async () => {
    const app = new Hono();
    app.route('/places', places);

    const res = await app.fetch(
      new Request('http://localhost/places/000000000000000000000000')
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('Place not found');
  });
});
