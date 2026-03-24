/**
 * Redis Pub/Sub for cross-pod WebSocket message relay.
 * When Redis is not available, all functions are no-ops.
 */
import { getRedis, getSub, isRedisEnabled } from '../db/redis';
import { config } from '../config';
import type { ServerMessage } from '@bubbles/shared';
import { broadcastToLocalClients, getRoom } from './rooms';

interface PubSubMessage {
  originPodId: string;
  originSessionId?: string;
  message: ServerMessage;
}

const subscribedRooms = new Set<string>();

function channelName(placeId: string): string {
  return `room:${placeId}`;
}

/**
 * Initialize the subscription message handler.
 * Call once at startup after Redis is connected.
 */
export function initPubSub(): void {
  const sub = getSub();
  if (!sub) return;

  sub.on('message', (channel: string, data: string) => {
    try {
      const parsed: PubSubMessage = JSON.parse(data);
      // Skip messages from this pod
      if (parsed.originPodId === config.POD_ID) return;

      const placeId = channel.replace('room:', '');
      const room = getRoom(placeId);
      if (!room) return;

      // Broadcast to local clients, excluding the origin session
      broadcastToLocalClients(placeId, parsed.message, parsed.originSessionId);
    } catch (err) {
      console.error('[pubsub] Failed to handle message:', err);
    }
  });

  console.log('[pubsub] Initialized');
}

/**
 * Subscribe to a room's channel when the first local client joins.
 */
export async function subscribeRoom(placeId: string): Promise<void> {
  const sub = getSub();
  if (!sub || subscribedRooms.has(placeId)) return;

  subscribedRooms.add(placeId);
  await sub.subscribe(channelName(placeId)).catch((err) => {
    console.error(`[pubsub] Failed to subscribe to ${placeId}:`, err.message);
    subscribedRooms.delete(placeId);
  });
}

/**
 * Unsubscribe from a room's channel when the last local client leaves.
 */
export async function unsubscribeRoom(placeId: string): Promise<void> {
  const sub = getSub();
  if (!sub || !subscribedRooms.has(placeId)) return;

  subscribedRooms.delete(placeId);
  await sub.unsubscribe(channelName(placeId)).catch(() => {});
}

/**
 * Publish a server message to other pods via Redis.
 */
export async function publishToRoom(
  placeId: string,
  message: ServerMessage,
  originSessionId?: string,
): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  const payload: PubSubMessage = {
    originPodId: config.POD_ID,
    originSessionId,
    message,
  };

  await redis.publish(channelName(placeId), JSON.stringify(payload)).catch((err) => {
    console.error(`[pubsub] Failed to publish to ${placeId}:`, err.message);
  });
}
