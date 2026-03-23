import type { WSContext } from 'hono/ws';
import type { BubblesUser } from '../middleware/auth';
import type { BubbleSize, BubblePattern, UserInfo, BubbleInfo, ServerMessage } from '@bubbles/shared';
import { PLACE_INACTIVE_TIMEOUT, BUBBLE_LIFETIME } from '@bubbles/shared';
import { getCollection } from '../db/mongo';
import { ObjectId } from 'mongodb';

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

export function joinRoom(
  placeId: string,
  sessionId: string,
  ws: WSContext,
  user: BubblesUser
): void {
  const room = getOrCreateRoom(placeId);
  room.lastActivity = Date.now();

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

  // Broadcast user_joined to others
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
  broadcastToRoom(placeId, joinMsg, sessionId);

  // Send room_state to the joining client
  const users: UserInfo[] = [];
  for (const [, client] of room.clients) {
    users.push({
      sessionId: client.user.sessionId,
      displayName: client.user.displayName,
      isAuthenticated: client.user.isAuthenticated,
      color: client.user.color,
    });
  }

  const bubbles: BubbleInfo[] = [];
  for (const [, bubble] of room.bubbles) {
    bubbles.push({
      bubbleId: bubble.id,
      blownBy: bubble.blownBy,
      x: bubble.x,
      y: bubble.y,
      z: bubble.z,
      size: bubble.size,
      color: bubble.color,
      pattern: bubble.pattern,
      seed: bubble.seed,
      createdAt: bubble.createdAt,
      expiresAt: bubble.expiresAt,
    });
  }

  // We need to look up the place name
  getPlaceName(placeId).then((placeName) => {
    const stateMsg: ServerMessage = {
      type: 'room_state',
      ts: Date.now(),
      data: { placeId, placeName, users, bubbles },
    };
    sendToClient(ws, stateMsg);
  });

  // Update lastActivityAt in DB
  updatePlaceActivity(placeId);
}

export function leaveRoom(placeId: string, sessionId: string): void {
  const room = rooms.get(placeId);
  if (!room) return;

  room.clients.delete(sessionId);
  room.lastActivity = Date.now();

  // Broadcast user_left
  const leaveMsg: ServerMessage = {
    type: 'user_left',
    ts: Date.now(),
    data: { sessionId },
  };
  broadcastToRoom(placeId, leaveMsg);

  // If room is empty, schedule place for deletion
  if (room.clients.size === 0) {
    markPlaceForDeletion(placeId);
  }
}

export function broadcastToRoom(
  placeId: string,
  message: ServerMessage,
  excludeSessionId?: string
): void {
  const room = rooms.get(placeId);
  if (!room) return;

  const data = JSON.stringify(message);
  let sent = 0;
  for (const [sid, client] of room.clients) {
    if (sid === excludeSessionId) continue;
    try {
      client.ws.send(data);
      sent++;
    } catch {
      // Client disconnected, will be cleaned up
    }
  }
  console.log(`[ws] Broadcast ${message.type} to ${sent}/${room.clients.size} clients (excluded: ${excludeSessionId?.slice(0,8) ?? 'none'})`);
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
      // Clear all bubble timers
      for (const [, bubble] of room.bubbles) {
        clearTimeout(bubble.timer);
      }
      rooms.delete(placeId);
      console.log(`[rooms] Cleaned up stale room: ${placeId}`);
    }
  }
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
}

export function removeBubble(placeId: string, bubbleId: string): ActiveBubble | undefined {
  const room = rooms.get(placeId);
  if (!room) return undefined;

  const bubble = room.bubbles.get(bubbleId);
  if (!bubble) return undefined;

  clearTimeout(bubble.timer);
  room.bubbles.delete(bubbleId);
  return bubble;
}

function expireBubble(placeId: string, bubbleId: string): void {
  const room = rooms.get(placeId);
  if (!room) return;

  const bubble = room.bubbles.get(bubbleId);
  if (!bubble) return;

  room.bubbles.delete(bubbleId);

  const msg: ServerMessage = {
    type: 'bubble_expired',
    ts: Date.now(),
    data: { bubbleId },
  };
  broadcastToRoom(placeId, msg);
}

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
