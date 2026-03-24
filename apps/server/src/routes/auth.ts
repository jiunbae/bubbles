import { Hono } from 'hono';
import * as jose from 'jose';
import { config } from '../config';
import { getRedis } from '../db/redis';

const TICKET_TTL_SEC = 30;
const TICKET_PREFIX = 'ws-ticket:';

interface TicketData {
  userId: string | undefined;
  displayName: string;
}

export async function createTicket(userId: string | undefined, displayName: string): Promise<string> {
  const ticket = crypto.randomUUID();
  const data = JSON.stringify({ userId, displayName });

  const redis = getRedis();
  if (redis) {
    await redis.set(`${TICKET_PREFIX}${ticket}`, data, 'EX', TICKET_TTL_SEC);
  } else {
    // Fallback: in-memory (single-instance only)
    fallbackTickets.set(ticket, { data, expiresAt: Date.now() + TICKET_TTL_SEC * 1000 });
  }

  return ticket;
}

export async function consumeTicket(ticket: string): Promise<TicketData | null> {
  const redis = getRedis();
  if (redis) {
    // Atomic get-and-delete
    const raw = await redis.getdel(`${TICKET_PREFIX}${ticket}`);
    if (!raw) return null;
    return JSON.parse(raw);
  }

  // Fallback: in-memory
  const entry = fallbackTickets.get(ticket);
  if (!entry) return null;
  fallbackTickets.delete(ticket);
  if (entry.expiresAt <= Date.now()) return null;
  return JSON.parse(entry.data);
}

// In-memory fallback for when Redis is not available (dev/single-instance)
const fallbackTickets = new Map<string, { data: string; expiresAt: number }>();
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of fallbackTickets) {
    if (v.expiresAt <= now) fallbackTickets.delete(k);
  }
}, 60_000);

export const auth = new Hono();

// Exchange JWT for a short-lived, single-use WebSocket ticket
auth.post('/ws-ticket', async (c) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Missing Authorization header' }, 401);
  }

  const token = authHeader.slice(7);
  try {
    const secret = new TextEncoder().encode(config.JWT_SECRET);
    const { payload } = await jose.jwtVerify(token, secret);
    const userId = payload.sub;
    const displayName = (payload.name as string) || (payload.username as string) || 'User';

    const ticket = await createTicket(userId, displayName);
    return c.json({ ticket });
  } catch {
    return c.json({ error: 'Invalid token' }, 401);
  }
});
