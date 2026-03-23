import { MongoClient, type Db, type Collection, type Document } from 'mongodb';
import { config } from '../config';
import { LOG_RETENTION_DAYS } from '@bubbles/shared';

let client: MongoClient;
let db: Db;

export async function connectMongo(): Promise<void> {
  client = new MongoClient(config.MONGO_URI, {
    connectTimeoutMS: 10000,
    serverSelectionTimeoutMS: 10000,
    socketTimeoutMS: 30000,
  });

  await client.connect();
  db = client.db();
  console.log('[mongo] Connected to MongoDB');
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

    // Action logs indexes
    logsCol.createIndex({ placeId: 1, createdAt: -1 }),
    logsCol.createIndex({ sessionId: 1, createdAt: -1 }),
    logsCol.createIndex(
      { createdAt: 1 },
      { expireAfterSeconds: LOG_RETENTION_DAYS * 24 * 60 * 60 }
    ),
  ]);

  console.log('[mongo] Indexes ensured');
}

export async function disconnectMongo(): Promise<void> {
  if (client) {
    await client.close();
    console.log('[mongo] Disconnected from MongoDB');
  }
}
