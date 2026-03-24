import type { Context } from 'hono';
import type { WSContext } from 'hono/ws';
import * as jose from 'jose';
import { config } from '../config';
import {
  generateSessionId,
  generateDisplayName,
  verifySession,
} from '../utils/session';
import { checkRateLimit } from '../middleware/rateLimiter';
import {
  joinRoom,
  leaveRoom,
  broadcastToRoom,
  sendToClient,
  getRoom,
  createBubble,
  removeBubble,
} from './rooms';
import { logAction } from './actions';
import type { BubblesUser } from '../middleware/auth';
import type { ClientMessage, ServerMessage, BubbleSize, BubblePattern } from '@bubbles/shared';
import { BUBBLE_LIFETIME } from '@bubbles/shared';
import { isAllowedOrigin } from '../middleware/cors';
import { incCounter, incGauge, decGauge } from '../metrics';

const lastCursorSent = new Map<string, number>();
const CURSOR_THROTTLE_MS = 100;

// Store state by sessionId (WSContext is recreated on each event by Hono)
const sessionStates = new Map<string, {
  placeId: string;
  user: BubblesUser;
  ws: WSContext;
}>();

export function createWSHandlers(placeId: string, c: Context) {
  // Generate session ID at handler creation time (before WS events)
  let sessionId = generateSessionId();

  return {
    async onOpen(_event: Event, ws: WSContext) {
      const origin = c.req.header('Origin');
      if (origin && !isAllowedOrigin(origin)) {
        console.warn(`[ws] Rejected from unauthorized origin: ${origin}`);
        ws.close(1008, 'Forbidden origin');
        return;
      }

      const url = new URL(c.req.url);
      const token = url.searchParams.get('token');

      let userId: string | undefined;
      let displayName: string | undefined;
      let isAuthenticated = false;

      if (token) {
        try {
          const secret = new TextEncoder().encode(config.JWT_SECRET);
          const { payload } = await jose.jwtVerify(token, secret);
          userId = payload.sub;
          displayName = (payload.name as string) || (payload.username as string);
          isAuthenticated = true;
        } catch {}
      }

      if (!displayName) {
        displayName = generateDisplayName(sessionId);
      }

      const colorHash = sessionId.split('').reduce((acc, ch) => ((acc << 5) - acc + ch.charCodeAt(0)) | 0, 0);
      const USER_COLORS = ['#FFB5C2', '#87CEEB', '#98FB98', '#DDA0DD', '#FFD700', '#FFDAB9', '#FF69B4', '#FFA07A'];
      const color = USER_COLORS[Math.abs(colorHash) % USER_COLORS.length];

      const user: BubblesUser = {
        sessionId,
        userId,
        displayName,
        isAuthenticated,
        color,
      };

      // Store by sessionId — survives WSContext recreation
      sessionStates.set(sessionId, { placeId, user, ws });

      console.log(`[ws] ${displayName} (${sessionId.slice(0,8)}) joined room ${placeId.slice(0,8)}`);
      incGauge('ws_connections_active');
      incCounter('ws_connections_total');
      joinRoom(placeId, sessionId, ws, user);
      await logAction('join', placeId, sessionId, user);
    },

    async onMessage(event: MessageEvent, ws: WSContext) {
      // Look up state by sessionId (captured in closure)
      const state = sessionStates.get(sessionId);
      if (!state) {
        console.warn(`[ws] No state for session ${sessionId.slice(0,8)}`);
        return;
      }
      // Update ws reference (may be a new WSContext instance)
      state.ws = ws;

      let msg: ClientMessage;
      try {
        const raw = typeof event.data === 'string' ? event.data : event.data.toString();
        msg = JSON.parse(raw);
      } catch {
        sendToClient(ws, {
          type: 'error', ts: Date.now(),
          data: { code: 'INVALID_MESSAGE', message: 'Invalid JSON' },
        });
        return;
      }

      const { placeId: pid, user } = state;
      console.log(`[ws] Message from ${user.displayName}: ${msg.type}`);

      switch (msg.type) {
        case 'blow': {
          const rateCheck = checkRateLimit(sessionId, 'blow', user.isAuthenticated);
          if (!rateCheck.allowed) {
            sendToClient(ws, {
              type: 'error', ts: Date.now(),
              data: { code: 'RATE_LIMITED', message: `Too many blows. Try again in ${rateCheck.retryAfter}s` },
            });
            return;
          }

          const { size, color, pattern, x, y, z, seed: clientSeed, expiresAt: clientExpiresAt } = msg.data as any;
          if (!['S', 'M', 'L'].includes(size)) return;

          const bubbleId = crypto.randomUUID();
          const now = Date.now();

          // Use client-provided seed/expiresAt for sync, with fallback
          const seed = typeof clientSeed === 'number' ? clientSeed : Math.floor(Math.random() * 1000000);
          const lifetime = BUBBLE_LIFETIME[size as BubbleSize];
          const duration = typeof clientExpiresAt === 'number'
            ? Math.min(Math.max(clientExpiresAt - now, 3000), 60000) // clamp 3s-60s
            : lifetime.min + Math.random() * (lifetime.max - lifetime.min);

          const bx = typeof x === 'number' ? x : (Math.random() - 0.5) * 2;
          const by = typeof y === 'number' ? y : 0.5 + Math.random();
          const bz = typeof z === 'number' ? z : (Math.random() - 0.5) * 2;

          const bubble = {
            id: bubbleId,
            blownBy: {
              sessionId: user.sessionId,
              displayName: user.displayName,
              isAuthenticated: user.isAuthenticated,
              color: user.color,
            },
            x: bx, y: by, z: bz,
            size: size as BubbleSize,
            color: typeof color === 'string' ? color : '#87CEEB',
            pattern: (pattern || 'plain') as BubblePattern,
            seed,
            createdAt: now,
            expiresAt: typeof clientExpiresAt === 'number' ? clientExpiresAt : now + duration,
          };

          createBubble(pid, bubble);

          const createdMsg: ServerMessage = {
            type: 'bubble_created', ts: now,
            data: {
              bubbleId: bubble.id,
              blownBy: bubble.blownBy,
              x: bubble.x, y: bubble.y, z: bubble.z,
              size: bubble.size,
              color: bubble.color,
              pattern: bubble.pattern,
              seed: bubble.seed,
              createdAt: bubble.createdAt,
              expiresAt: bubble.expiresAt,
            },
          };

          console.log(`[ws] Bubble blown by ${user.displayName}, broadcasting to others`);
          incCounter('bubbles_blown_total', { size });
          broadcastToRoom(pid, createdMsg, sessionId);

          await logAction('blow', pid, sessionId, user, { bubbleId, size, color });
          break;
        }

        case 'pop': {
          const { bubbleId } = msg.data;
          const room = getRoom(pid);
          if (!room) return;

          const bubble = room.bubbles.get(bubbleId);
          if (!bubble) return;

          const rateCheck = checkRateLimit(sessionId, 'pop', user.isAuthenticated);
          if (!rateCheck.allowed) {
            sendToClient(ws, {
              type: 'error', ts: Date.now(),
              data: { code: 'RATE_LIMITED', message: `Too many pops. Try again in ${rateCheck.retryAfter}s` },
            });
            return;
          }

          removeBubble(pid, bubbleId);
          incCounter('bubbles_popped_total');

          const popMsg: ServerMessage = {
            type: 'bubble_popped', ts: Date.now(),
            data: {
              bubbleId,
              poppedBy: {
                sessionId: user.sessionId,
                displayName: user.displayName,
                isAuthenticated: user.isAuthenticated,
                color: user.color,
              },
            },
          };
          broadcastToRoom(pid, popMsg, sessionId);

          await logAction('pop', pid, sessionId, user, { bubbleId });
          break;
        }

        case 'cursor': {
          const key = `${pid}:${sessionId}`;
          const now = Date.now();
          const last = lastCursorSent.get(key) || 0;
          if (now - last < CURSOR_THROTTLE_MS) return;
          lastCursorSent.set(key, now);

          const cursorMsg: ServerMessage = {
            type: 'cursor_moved', ts: now,
            data: { sessionId, x: msg.data.x, y: msg.data.y },
          };
          broadcastToRoom(pid, cursorMsg, sessionId);
          break;
        }

        case 'ping': {
          const room = getRoom(pid);
          if (room) {
            const client = room.clients.get(sessionId);
            if (client) client.lastPingAt = Date.now();
          }
          sendToClient(ws, { type: 'pong', ts: Date.now() });
          break;
        }
      }
    },

    async onClose(_event: CloseEvent, ws: WSContext) {
      const state = sessionStates.get(sessionId);
      if (!state) return;

      console.log(`[ws] ${state.user.displayName} left room ${state.placeId.slice(0,8)}`);
      decGauge('ws_connections_active');
      leaveRoom(state.placeId, sessionId);
      sessionStates.delete(sessionId);
      lastCursorSent.delete(`${state.placeId}:${sessionId}`);

      await logAction('leave', state.placeId, sessionId, state.user);
    },

    onError(_event: Event, ws: WSContext) {
      const state = sessionStates.get(sessionId);
      if (state) {
        console.error(`[ws] Error for ${state.user.displayName}`);
        decGauge('ws_connections_active');
        leaveRoom(state.placeId, sessionId);
        sessionStates.delete(sessionId);
        lastCursorSent.delete(`${state.placeId}:${sessionId}`);
      }
    },
  };
}
