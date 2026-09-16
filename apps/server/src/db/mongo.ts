import { MongoClient, type Db, type Collection, type Document } from 'mongodb';
import { config } from '../config';
import { LOG_RETENTION_DAYS } from '@bubbles/shared';
import { createLogger } from '../logger';

const log = createLogger('mongo');

let client: MongoClient;
let db: Db;

export async function connectMongo(): Promise<void> {
  const candidate = new MongoClient(config.MONGO_URI, {
    connectTimeoutMS: 10000,
    serverSelectionTimeoutMS: 10000,
    socketTimeoutMS: 30000,
  });

  try {
    await candidate.connect();
  } catch (err) {
    // Drop the failed client before rethrowing. Callers retry, and a client
    // that never connected still holds its monitoring timers open.
    await candidate.close().catch(() => {});
    throw err;
  }

  client = candidate;
  db = client.db();
  log.info('Connected to MongoDB');
}

/**
 * Connect and build indexes, retrying until it succeeds.
 *
 * Exiting on the first failure was worse than waiting: every node restart
 * raced both server pods against a single mongod that needs longer than the
 * 10s selection timeout to come up, so the process died, CrashLoopBackOff
 * took over, and its backoff grew to minutes — far outlasting the blip that
 * caused it. The startup probe already grants 150s; spend it here instead.
 * Readiness keeps returning 503 until this resolves, so no traffic arrives
 * before the database is usable.
 */
export async function connectMongoWithRetry(): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await connectMongo();
      await ensureIndexes();
      return;
    } catch (err) {
      const delayMs = Math.min(attempt * 1000, 15000);
      log.error('MongoDB unavailable, retrying', {
        err: String(err),
        attempt,
        delayMs,
      });
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

export function getDb(): Db {
  if (!db) {
    throw new Error('MongoDB not connected. Call connectMongo() first.');
  }
  return db;
}

export function getCollection<T extends Document>(name: string): Collection<T> {
  return getDb().collection<T>(name);
}

export async function ensureIndexes(): Promise<void> {
  const placesCol = getDb().collection('places');
  const logsCol = getDb().collection('action_logs');

  await Promise.all([
    // Places indexes
    placesCol.createIndex({ name: 1 }, { unique: true }),
    placesCol.createIndex({ deleteAfter: 1 }, { expireAfterSeconds: 0 }),
    placesCol.createIndex({ lastActivityAt: -1 }),
    placesCol.createIndex({ createdBy: 1 }),

    // Action logs indexes
    logsCol.createIndex({ placeId: 1, createdAt: -1 }),
    logsCol.createIndex({ sessionId: 1, createdAt: -1 }),
    logsCol.createIndex(
      { createdAt: 1 },
      { expireAfterSeconds: LOG_RETENTION_DAYS * 24 * 60 * 60 }
    ),
  ]);

  log.info('Indexes ensured');
}

export async function disconnectMongo(): Promise<void> {
  if (client) {
    await client.close();
    log.info('Disconnected from MongoDB');
  }
}
