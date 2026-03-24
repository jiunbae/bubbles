import { Hono } from 'hono';
import * as jose from 'jose';
import { config } from '../config';

// In-memory ticket store: ticket -> { userId, displayName, expiresAt }
interface TicketData {
  userId: string | undefined;
  displayName: string;
  expiresAt: number;
}

const tickets = new Map<string, TicketData>();
const TICKET_TTL_MS = 30_000; // 30 seconds

// Periodic cleanup of expired tickets
setInterval(() => {
  const now = Date.now();
  for (const [ticket, data] of tickets) {
    if (data.expiresAt <= now) tickets.delete(ticket);
  }
}, 60_000);

export function createTicket(userId: string | undefined, displayName: string): string {
  const ticket = crypto.randomUUID();
  tickets.set(ticket, {
    userId,
    displayName,
    expiresAt: Date.now() + TICKET_TTL_MS,
  });
  return ticket;
}

export function consumeTicket(ticket: string): TicketData | null {
  const data = tickets.get(ticket);
  if (!data) return null;
  tickets.delete(ticket); // one-time use
  if (data.expiresAt <= Date.now()) return null;
  return data;
}

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

    const ticket = createTicket(userId, displayName);
    return c.json({ ticket });
  } catch {
    return c.json({ error: 'Invalid token' }, 401);
  }
});
