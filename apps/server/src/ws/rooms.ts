import type { WSContext } from 'hono/ws';
import type { BubblesUser } from '../middleware/auth';
import type { BubbleSize, BubblePattern, UserInfo, BubbleInfo, ServerMessage } from '@bubbles/shared';
import { PLACE_INACTIVE_TIMEOUT } from '@bubbles/shared';
import { getCollection } from '../db/mongo';
import { ObjectId } from 'mongodb';
import { setGauge, incCounter } from '../metrics';
import { getRedis, isRedisEnabled } from '../db/redis';
import { config } from '../config';
import { publishToRoom, subscribeRoom, unsubscribeRoom } from './pubsub';

export interface ActiveBubble {
  id: string;
  blownBy: UserInfo;
  x: number;
  y: number;
  z: number;
  size: BubbleSize;
  color: string;
  pattern: BubblePattern;
  seed: number;
  createdAt: number;
  expiresAt: number;
  timer: Timer;
}

export interface PlaceRoom {
  placeId: string;
  clients: Map<string, { ws: WSContext; user: BubblesUser; lastPingAt: number }>;
  bubbles: Map<string, ActiveBubble>;
  lastActivity: number;
}

const rooms = new Map<string, PlaceRoom>();

// --- Redis key helpers ---

function memberKey(placeId: string): string {
  return `room:${placeId}:members`;
}

function bubbleKey(placeId: string): string {
  return `room:${placeId}:bubbles`;
}

// --- Redis state sync (fire-and-forget, non-blocking) ---

async function redisAddMember(placeId: string, sessionId: string, user: BubblesUser): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    const info: UserInfo & { podId: string } = {
      sessionId: user.sessionId,
      displayName: user.displayName,
      isAuthenticated: user.isAuthenticated,
      color: user.color,
      podId: config.POD_ID,
    };
    await redis.hset(memberKey(placeId), sessionId, JSON.stringify(info));
  } catch (err) {
    console.error('[rooms/redis] Failed to add member:', err);
  }
}

async function redisRemoveMember(placeId: string, sessionId: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.hdel(memberKey(placeId), sessionId);
  } catch (err) {
    console.error('[rooms/redis] Failed to remove member:', err);
  }
}

async function redisAddBubble(placeId: string, bubble: Omit<ActiveBubble, 'timer'>): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    const { ...data } = bubble;
    await redis.hset(bubbleKey(placeId), bubble.id, JSON.stringify(data));
  } catch (err) {
    console.error('[rooms/redis] Failed to add bubble:', err);
  }
}

async function redisRemoveBubble(placeId: string, bubbleId: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.hdel(bubbleKey(placeId), bubbleId);
  } catch (err) {
    console.error('[rooms/redis] Failed to remove bubble:', err);
  }
}

/** Get all members from Redis (cross-pod). Falls back to local state. */
async function getRedisMembers(placeId: string): Promise<UserInfo[]> {
  const redis = getRedis();
  if (!redis) return getLocalMembers(placeId);
  try {
    const all = await redis.hgetall(memberKey(placeId));
    return Object.values(all).map((v) => {
      const parsed = JSON.parse(v);
      return {
        sessionId: parsed.sessionId,
        displayName: parsed.displayName,
        isAuthenticated: parsed.isAuthenticated,
        color: parsed.color,
      };
    });
  } catch {
    return getLocalMembers(placeId);
  }
}

/** Get all bubbles from Redis (cross-pod). Falls back to local state. */
async function getRedisBubbles(placeId: string): Promise<BubbleInfo[]> {
  const redis = getRedis();
  if (!redis) return getLocalBubbles(placeId);
  try {
    const all = await redis.hgetall(bubbleKey(placeId));
    const now = Date.now();
    return Object.values(all)
      .map((v) => JSON.parse(v))
      .filter((b) => b.expiresAt > now)
      .map((b) => ({
        bubbleId: b.id,
        blownBy: b.blownBy,
        x: b.x, y: b.y, z: b.z,
        size: b.size,
        color: b.color,
        pattern: b.pattern,
        seed: b.seed,
        createdAt: b.createdAt,
        expiresAt: b.expiresAt,
      }));
  } catch {
    return getLocalBubbles(placeId);
  }
}

function getLocalMembers(placeId: string): UserInfo[] {
  const room = rooms.get(placeId);
  if (!room) return [];
  return Array.from(room.clients.values()).map((c) => ({
    sessionId: c.user.sessionId,
    displayName: c.user.displayName,
    isAuthenticated: c.user.isAuthenticated,
    color: c.user.color,
  }));
}

function getLocalBubbles(placeId: string): BubbleInfo[] {
  const room = rooms.get(placeId);
  if (!room) return [];
  return Array.from(room.bubbles.values()).map((b) => ({
    bubbleId: b.id,
    blownBy: b.blownBy,
    x: b.x, y: b.y, z: b.z,
    size: b.size,
    color: b.color,
    pattern: b.pattern,
    seed: b.seed,
    createdAt: b.createdAt,
    expiresAt: b.expiresAt,
  }));
}

// --- Public API ---

export function getRoom(placeId: string): PlaceRoom | undefined {
  return rooms.get(placeId);
}

export function getOrCreateRoom(placeId: string): PlaceRoom {
  let room = rooms.get(placeId);
  if (!room) {
    room = {
      placeId,
      clients: new Map(),
      bubbles: new Map(),
      lastActivity: Date.now(),
    };
    rooms.set(placeId, room);
  }
  return room;
}

export async function joinRoom(
  placeId: string,
  sessionId: string,
  ws: WSContext,
  user: BubblesUser
): Promise<void> {
  const room = getOrCreateRoom(placeId);
  room.lastActivity = Date.now();

  // Subscribe to pub/sub channel if first local client
  const wasEmpty = room.clients.size === 0;

  // Remove existing connection for same session (reconnect)
  const existing = room.clients.get(sessionId);
  if (existing) {
    try {
      existing.ws.close(1000, 'Reconnected from another tab');
    } catch {
      // already closed
    }
  }

  room.clients.set(sessionId, { ws, user, lastPingAt: Date.now() });
  updateRoomGauges();

  // Redis: register member + subscribe to pub/sub
  redisAddMember(placeId, sessionId, user);
  if (wasEmpty) {
    subscribeRoom(placeId);
  }

  // Broadcast user_joined to others (local + cross-pod)
  const joinMsg: ServerMessage = {
    type: 'user_joined',
    ts: Date.now(),
    data: {
      sessionId: user.sessionId,
      displayName: user.displayName,
      isAuthenticated: user.isAuthenticated,
      color: user.color,
    },
  };
  broadcastToLocalClients(placeId, joinMsg, sessionId);
  publishToRoom(placeId, joinMsg, sessionId);

  // Send room_state to the joining client (from Redis if available)
  const [users, bubbles, placeName] = await Promise.all([
    getRedisMembers(placeId),
    getRedisBubbles(placeId),
    getPlaceName(placeId),
  ]);

  const stateMsg: ServerMessage = {
    type: 'room_state',
    ts: Date.now(),
    data: { placeId, placeName, mySessionId: sessionId, users, bubbles },
  };
  sendToClient(ws, stateMsg);

  // Update lastActivityAt in DB
  updatePlaceActivity(placeId);
}

export function leaveRoom(placeId: string, sessionId: string): void {
  const room = rooms.get(placeId);
  if (!room) return;

  room.clients.delete(sessionId);
  room.lastActivity = Date.now();
  updateRoomGauges();

  // Redis: remove member
  redisRemoveMember(placeId, sessionId);

  // Broadcast user_left (local + cross-pod)
  const leaveMsg: ServerMessage = {
    type: 'user_left',
    ts: Date.now(),
    data: { sessionId },
  };
  broadcastToLocalClients(placeId, leaveMsg);
  publishToRoom(placeId, leaveMsg, sessionId);

  // Unsubscribe + cleanup if room is empty locally
  if (room.clients.size === 0) {
    unsubscribeRoom(placeId);
    markPlaceForDeletion(placeId);
  }
}

/** Broadcast to local WS clients only (this pod). Used by both direct calls and pub/sub relay. */
export function broadcastToLocalClients(
  placeId: string,
  message: ServerMessage,
  excludeSessionId?: string
): void {
  const room = rooms.get(placeId);
  if (!room) return;

  const data = JSON.stringify(message);
  for (const [sid, client] of room.clients) {
    if (sid === excludeSessionId) continue;
    try {
      client.ws.send(data);
    } catch {
      // Client disconnected, will be cleaned up
    }
  }
}

/** Broadcast to all pods (local + Redis pub/sub). */
export function broadcastToRoom(
  placeId: string,
  message: ServerMessage,
  excludeSessionId?: string
): void {
  broadcastToLocalClients(placeId, message, excludeSessionId);
  publishToRoom(placeId, message, excludeSessionId);
}

export function sendToClient(ws: WSContext, message: ServerMessage): void {
  try {
    ws.send(JSON.stringify(message));
  } catch {
    // Client disconnected
  }
}

export function getRoomUserCount(placeId: string): number {
  const room = rooms.get(placeId);
  return room ? room.clients.size : 0;
}

export function cleanupStaleRooms(): void {
  const now = Date.now();
  for (const [placeId, room] of rooms) {
    if (room.clients.size === 0 && now - room.lastActivity > PLACE_INACTIVE_TIMEOUT) {
      for (const [, bubble] of room.bubbles) {
        clearTimeout(bubble.timer);
      }
      rooms.delete(placeId);
      console.log(`[rooms] Cleaned up stale room: ${placeId}`);
    }
  }
  updateRoomGauges();
}

export function createBubble(
  placeId: string,
  bubble: Omit<ActiveBubble, 'timer'>
): void {
  const room = rooms.get(placeId);
  if (!room) return;

  const timeToLive = bubble.expiresAt - Date.now();
  const timer = setTimeout(() => {
    expireBubble(placeId, bubble.id);
  }, timeToLive);

  room.bubbles.set(bubble.id, { ...bubble, timer });
  room.lastActivity = Date.now();
  updateRoomGauges();

  // Redis: store bubble
  redisAddBubble(placeId, bubble);
}

export function removeBubble(placeId: string, bubbleId: string): ActiveBubble | undefined {
  const room = rooms.get(placeId);
  if (!room) return undefined;

  const bubble = room.bubbles.get(bubbleId);
  if (!bubble) return undefined;

  clearTimeout(bubble.timer);
  room.bubbles.delete(bubbleId);
  updateRoomGauges();

  // Redis: remove bubble
  redisRemoveBubble(placeId, bubbleId);

  return bubble;
}

function expireBubble(placeId: string, bubbleId: string): void {
  const room = rooms.get(placeId);
  if (!room) return;

  const bubble = room.bubbles.get(bubbleId);
  if (!bubble) return;

  room.bubbles.delete(bubbleId);
  incCounter('bubbles_expired_total');
  updateRoomGauges();

  // Redis: remove expired bubble
  redisRemoveBubble(placeId, bubbleId);

  const msg: ServerMessage = {
    type: 'bubble_expired',
    ts: Date.now(),
    data: { bubbleId },
  };
  broadcastToRoom(placeId, msg);
}

/** Clean up stale entries from Redis (e.g. from crashed pods). */
export async function cleanupRedisStaleEntries(): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  try {
    // Find all room member keys
    const keys = await redis.keys('room:*:members');
    for (const key of keys) {
      const members = await redis.hgetall(key);
      for (const [sessionId, data] of Object.entries(members)) {
        const parsed = JSON.parse(data);
        // If this member was on our pod but isn't in our local rooms, remove it
        if (parsed.podId === config.POD_ID) {
          const placeId = key.replace('room:', '').replace(':members', '');
          const room = rooms.get(placeId);
          if (!room || !room.clients.has(sessionId)) {
            await redis.hdel(key, sessionId);
          }
        }
      }
    }

    // Clean up expired bubbles
    const bubbleKeys = await redis.keys('room:*:bubbles');
    const now = Date.now();
    for (const key of bubbleKeys) {
      const bubbles = await redis.hgetall(key);
      for (const [bubbleId, data] of Object.entries(bubbles)) {
        const parsed = JSON.parse(data);
        if (parsed.expiresAt <= now) {
          await redis.hdel(key, bubbleId);
        }
      }
    }
  } catch (err) {
    console.error('[rooms/redis] Cleanup failed:', err);
  }
}

// --- Private helpers ---

async function getPlaceName(placeId: string): Promise<string> {
  try {
    const col = getCollection('places');
    const doc = await col.findOne({ _id: new ObjectId(placeId) });
    return doc?.name ?? 'Unknown Place';
  } catch {
    return 'Unknown Place';
  }
}

async function updatePlaceActivity(placeId: string): Promise<void> {
  try {
    const col = getCollection('places');
    await col.updateOne(
      { _id: new ObjectId(placeId) },
      { $set: { lastActivityAt: new Date() }, $unset: { deleteAfter: '' } }
    );
  } catch (err) {
    console.error('[rooms] Failed to update place activity:', err);
  }
}

function updateRoomGauges(): void {
  let totalUsers = 0;
  let totalBubbles = 0;
  for (const room of rooms.values()) {
    totalUsers += room.clients.size;
    totalBubbles += room.bubbles.size;
  }
  setGauge('rooms_active', {}, rooms.size);
  setGauge('rooms_users_total', {}, totalUsers);
  setGauge('rooms_bubbles_total', {}, totalBubbles);
}

async function markPlaceForDeletion(placeId: string): Promise<void> {
  try {
    const col = getCollection('places');
    const deleteAfter = new Date(Date.now() + PLACE_INACTIVE_TIMEOUT);
    await col.updateOne(
      { _id: new ObjectId(placeId) },
      { $set: { deleteAfter } }
    );
  } catch (err) {
    console.error('[rooms] Failed to mark place for deletion:', err);
  }
}
