/**
 * Redis Pub/Sub for cross-pod WebSocket message relay.
 * When Redis is not available, all functions are no-ops.
 *
 * Uses a callback registration pattern to avoid circular imports with rooms.ts.
 */
import { getRedis, getSub, isRedisEnabled } from '../db/redis';
import { config } from '../config';
import type { ServerMessage } from '@bubbles/shared';

interface PubSubMessage {
  originPodId: string;
  originSessionId?: string;
  /** Pre-serialized ServerMessage JSON string (avoids double-stringify). */
  serialized: string;
}

/** Handler type for relaying pub/sub messages to local clients. */
type PubSubRelayHandler = (placeId: string, message: ServerMessage, excludeSessionId?: string) => void;

/** Handler for remote bubble tracking. */
type RemoteBubbleHandler = {
  addRemoteBubble: (placeId: string, data: unknown) => void;
  removeRemoteBubble: (placeId: string, bubbleId: string) => void;
};

let relayHandler: PubSubRelayHandler | null = null;
let remoteBubbleHandler: RemoteBubbleHandler | null = null;

/**
 * Register the handler that relays incoming pub/sub messages to local WS clients.
 * Called by rooms.ts at startup to break the circular dependency.
 */
export function setPubSubHandler(handler: PubSubRelayHandler): void {
  relayHandler = handler;
}

/**
 * Register handlers for remote bubble management (cross-pod expiry).
 */
export function setRemoteBubbleHandler(handler: RemoteBubbleHandler): void {
  remoteBubbleHandler = handler;
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
      const message: ServerMessage = JSON.parse(parsed.serialized);

      // Handle remote bubble tracking (#3)
      if (remoteBubbleHandler) {
        if (message.type === 'bubble_created') {
          remoteBubbleHandler.addRemoteBubble(placeId, message.data);
        } else if (message.type === 'bubble_expired' || message.type === 'bubble_popped') {
          remoteBubbleHandler.removeRemoteBubble(placeId, message.data.bubbleId);
        }
      }

      if (relayHandler) {
        relayHandler(placeId, message, parsed.originSessionId);
      }
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
 * Accepts an optional pre-serialized string to avoid double JSON.stringify.
 */
export async function publishToRoom(
  placeId: string,
  message: ServerMessage,
  originSessionId?: string,
  preSerialized?: string,
): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  const serialized = preSerialized ?? JSON.stringify(message);
  const payload: PubSubMessage = {
    originPodId: config.POD_ID,
    originSessionId,
    serialized,
  };

  await redis.publish(channelName(placeId), JSON.stringify(payload)).catch((err) => {
    console.error(`[pubsub] Failed to publish to ${placeId}:`, err.message);
  });
}
