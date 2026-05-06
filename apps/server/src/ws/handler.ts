import type { Context } from 'hono';
import type { WSContext } from 'hono/ws';
import { config } from '../config';
import { consumeTicket } from '../routes/auth';
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
  broadcastSerializedToLocal,
  sendToClient,
  getRoom,
  createBubble,
  removeBubble,
  incPlaceStats,
  updateMemberInRedis,
} from './rooms';
import { logAction } from './actions';
import type { BubblesUser } from '../middleware/auth';
import type { ClientMessage, ServerMessage, BubbleSize, BubblePattern } from '@bubbles/shared';
import { BUBBLE_LIFETIME } from '@bubbles/shared';
import { isAllowedOrigin } from '../middleware/cors';
import { incCounter, incGauge, decGauge } from '../metrics';
import { createLogger } from '../logger';

const log = createLogger('ws');

const lastCursorSent = new Map<string, number>();
const CURSOR_THROTTLE_MS = 100;

// Store state by sessionId (WSContext is recreated on each event by Hono)
const sessionStates = new Map<string, {
  placeId: string;
  user: BubblesUser;
  ws: WSContext;
}>();

/** Get all active sessions — used by graceful shutdown to close WS connections. */
export function getAllSessions() {
  return sessionStates;
}

/** Remove orphaned lastCursorSent entries for sessions that no longer exist. */
export function cleanupStaleCursors(): void {
  for (const key of lastCursorSent.keys()) {
    // Key format is "placeId:sessionId"
    const sessionId = key.substring(key.lastIndexOf(':') + 1);
    if (!sessionStates.has(sessionId)) {
      lastCursorSent.delete(key);
    }
  }
}

/** Clean up sessionStates entries for sessions with no recent ping (zombie TCP connections). */
export async function cleanupStaleSessions(): Promise<void> {
  const now = Date.now();
  const STALE_SESSION_THRESHOLD = 2 * 60 * 1000; // 2 minutes
  for (const [sessionId, state] of sessionStates) {
    const room = getRoom(state.placeId);
    if (!room) {
      sessionStates.delete(sessionId);
      lastCursorSent.delete(`${state.placeId}:${sessionId}`);
      continue;
    }
    const client = room.clients.get(sessionId);
    if (!client || now - client.lastPingAt > STALE_SESSION_THRESHOLD) {
      try {
        await leaveRoom(state.placeId, sessionId);
      } catch {
        // best-effort cleanup
      }
      sessionStates.delete(sessionId);
      lastCursorSent.delete(`${state.placeId}:${sessionId}`);
    }
  }
}

export function createWSHandlers(placeId: string, c: Context) {
  // Generate session ID at handler creation time (before WS events)
  let sessionId = generateSessionId();

  return {
    async onOpen(_event: Event, ws: WSContext) {
      const origin = c.req.header('Origin');
      if (origin && !isAllowedOrigin(origin)) {
        log.warn('Rejected from unauthorized origin', { origin });
        ws.close(1008, 'Forbidden origin');
        return;
      }

      const url = new URL(c.req.url);
      const ticket = url.searchParams.get('ticket');

      let userId: string | undefined;
      let displayName: string | undefined;
      let isAuthenticated = false;

      let authError: string | undefined;
      if (ticket) {
        const ticketData = await consumeTicket(ticket);
        if (ticketData) {
          userId = ticketData.userId;
          displayName = ticketData.displayName;
          isAuthenticated = true;
        } else {
          log.warn('Invalid or expired WS ticket');
          authError = 'TICKET_INVALID';
        }
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

      log.info('User joined room', { user: displayName, sessionId: sessionId.slice(0,8), placeId: placeId.slice(0,8) });
      incGauge('ws_connections_active');
      incCounter('ws_connections_total');
      try {
        await joinRoom(placeId, sessionId, ws, user);
        incPlaceStats(placeId, 'totalVisitors');

        // Notify client if token was provided but failed verification
        if (authError) {
          sendToClient(ws, {
            type: 'error', ts: Date.now(),
            data: { code: authError, message: 'Authentication failed. Connected as anonymous.' },
          });
        }

        await logAction('join', placeId, sessionId, user);
      } catch (err) {
        log.error('Error during WebSocket onOpen', { err: String(err), sessionId: sessionId.slice(0,8) });
      }
    },

    async onMessage(event: MessageEvent, ws: WSContext) {
      // Look up state by sessionId (captured in closure)
      const state = sessionStates.get(sessionId);
      if (!state) {
        log.warn('No state for session', { sessionId: sessionId.slice(0,8) });
        return;
      }
      // Update ws reference (may be a new WSContext instance)
      state.ws = ws;

      // Reject oversized messages (4KB limit) before parsing
      const rawData = typeof event.data === 'string' ? event.data : event.data.toString();
      if (rawData.length > 4096) {
        sendToClient(ws, {
          type: 'error', ts: Date.now(),
          data: { code: 'MESSAGE_TOO_LARGE', message: 'Message exceeds 4KB limit' },
        });
        return;
      }

      let msg: ClientMessage;
      try {
        msg = JSON.parse(rawData);
      } catch {
        sendToClient(ws, {
          type: 'error', ts: Date.now(),
          data: { code: 'INVALID_MESSAGE', message: 'Invalid JSON' },
        });
        return;
      }

      const { placeId: pid, user } = state;
      if (msg.type !== 'ping' && msg.type !== 'cursor') {
        log.debug('Message received', { user: user.displayName, type: msg.type });
      }

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

          const { size, color, pattern, x, y, z, seed: clientSeed, expiresAt: clientExpiresAt } = msg.data;
          if (!(['S', 'M', 'L'] as string[]).includes(size)) return;

          // Validate color is a valid hex
          const validColor = typeof color === 'string' && /^#[0-9a-fA-F]{6}$/.test(color) ? color : '#87CEEB';

          const bubbleId = crypto.randomUUID();
          const now = Date.now();

          const seed = typeof clientSeed === 'number' ? clientSeed : Math.floor(Math.random() * 1000000);
          const lifetime = BUBBLE_LIFETIME[size as BubbleSize];
          const duration = typeof clientExpiresAt === 'number'
            ? Math.min(Math.max(clientExpiresAt - now, 3000), 60000)
            : lifetime.min + Math.random() * (lifetime.max - lifetime.min);

          const bx = typeof x === 'number' ? x : (Math.random() - 0.5) * 2;
          const by = typeof y === 'number' ? y : 0.5 + Math.random();
          const bz = typeof z === 'number' ? z : (Math.random() - 0.5) * 2;

          // Always compute expiresAt server-side — never trust client value
          const expiresAt = now + duration;

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
            color: validColor,
            pattern: (pattern || 'plain') as BubblePattern,
            seed,
            createdAt: now,
            expiresAt,
          };

          await createBubble(pid, bubble);
          incPlaceStats(pid, 'totalBubbles');

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

          log.debug('Bubble blown', { user: user.displayName, size });
          incCounter('bubbles_blown_total', { size });
          broadcastToRoom(pid, createdMsg, sessionId);

          try {
            await logAction('blow', pid, sessionId, user, { bubbleId, size, color });
          } catch (err) {
            log.error('Failed to log blow action', { err: String(err), sessionId: sessionId.slice(0,8) });
          }
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

          try {
            await logAction('pop', pid, sessionId, user, { bubbleId });
          } catch (err) {
            log.error('Failed to log pop action', { err: String(err), sessionId: sessionId.slice(0,8) });
          }
          break;
        }

        case 'set_name': {
          const rateCheckName = checkRateLimit(sessionId, 'blow', user.isAuthenticated); // reuse blow bucket (5/min effective)
          if (!rateCheckName.allowed) {
            sendToClient(ws, {
              type: 'error', ts: Date.now(),
              data: { code: 'RATE_LIMITED', message: `Too many renames. Try again in ${rateCheckName.retryAfter}s` },
            });
            return;
          }

          const newName = msg.data.displayName;
          if (typeof newName !== 'string') return;

          // Sanitize: trim, truncate, strip HTML and control characters
          const trimmed = newName.trim().slice(0, 30).replace(/[<>&"']/g, '').replace(/[\x00-\x1f\x7f-\x9f]/g, '');
          if (trimmed.length < 1) {
            sendToClient(ws, {
              type: 'error', ts: Date.now(),
              data: { code: 'INVALID_NAME', message: 'Name must be at least 1 character' },
            });
            return;
          }

          const oldName = user.displayName;
          user.displayName = trimmed;

          // Update in room clients map
          const room = getRoom(pid);
          if (room) {
            const client = room.clients.get(sessionId);
            if (client) client.user.displayName = trimmed;
          }

          log.info('User renamed', { from: oldName, to: trimmed });

          // Sync updated name to Redis so cross-pod room_state is correct
          await updateMemberInRedis(pid, sessionId, user);

          const renameMsg: ServerMessage = {
            type: 'user_renamed', ts: Date.now(),
            data: { sessionId, displayName: trimmed },
          };
          broadcastToRoom(pid, renameMsg);
          break;
        }

        case 'set_color': {
          const newColor = msg.data.color;
          if (typeof newColor !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(newColor)) return;

          user.color = newColor;

          // Update in room clients map
          const colorRoom = getRoom(pid);
          if (colorRoom) {
            const client = colorRoom.clients.get(sessionId);
            if (client) client.user.color = newColor;
          }

          // Sync updated color to Redis
          await updateMemberInRedis(pid, sessionId, user);

          const colorMsg: ServerMessage = {
            type: 'user_color_changed', ts: Date.now(),
            data: { sessionId, color: newColor },
          };
          broadcastToRoom(pid, colorMsg);
          break;
        }

        case 'cursor': {
          const key = `${pid}:${sessionId}`;
          const now = Date.now();
          const last = lastCursorSent.get(key) || 0;
          if (now - last < CURSOR_THROTTLE_MS) return;
          lastCursorSent.set(key, now);

          // Use pre-serialized broadcast to avoid JSON.stringify per-client
          const cursorMsg: ServerMessage = {
            type: 'cursor_moved', ts: now,
            data: { sessionId, x: msg.data.x, y: msg.data.y },
          };
          broadcastSerializedToLocal(pid, JSON.stringify(cursorMsg), sessionId);
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

      log.info('User left room', { user: state.user.displayName, placeId: state.placeId.slice(0,8) });
      decGauge('ws_connections_active');
      try {
        await leaveRoom(state.placeId, sessionId);
      } catch (err) {
        log.error('Error leaving room on close', { err: String(err), sessionId: sessionId.slice(0,8) });
      }
      sessionStates.delete(sessionId);
      lastCursorSent.delete(`${state.placeId}:${sessionId}`);

      try {
        await logAction('leave', state.placeId, sessionId, state.user);
      } catch (err) {
        log.error('Failed to log leave action', { err: String(err), sessionId: sessionId.slice(0,8) });
      }
    },

    onError(_event: Event, _ws: WSContext) {
      // Only log — onClose always fires after onError, so all cleanup happens there.
      const state = sessionStates.get(sessionId);
      if (state) {
        log.error('WebSocket error', { user: state.user.displayName });
      }
    },
  };
}
