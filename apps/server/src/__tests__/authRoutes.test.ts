import { describe, expect, it } from 'bun:test';
import { Hono } from 'hono';
import { SignJWT } from 'jose';
import { auth, consumeTicket } from '../routes/auth';

async function token(payload: Record<string, unknown>): Promise<string> {
  const secret = new TextEncoder().encode(process.env.JWT_SECRET!);
  return new SignJWT(payload).setProtectedHeader({ alg: 'HS256' }).sign(secret);
}

describe('auth routes', () => {
  it('rejects a validly signed token without a stable subject', async () => {
    const app = new Hono();
    app.route('/auth', auth);
    const jwt = await token({ name: 'No Subject' });

    const res = await app.fetch(
      new Request('http://localhost/auth/ws-ticket', {
        method: 'POST',
        headers: { Authorization: `Bearer ${jwt}` },
      })
    );

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Token is missing a subject' });
  });

  it('carries only the stable account subject and sanitized display name', async () => {
    const app = new Hono();
    app.route('/auth', auth);
    const jwt = await token({ sub: 'account-123', name: '<b>Alice</b>' });

    const res = await app.fetch(
      new Request('http://localhost/auth/ws-ticket', {
        method: 'POST',
        headers: { Authorization: `Bearer ${jwt}` },
      })
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ticket: string };
    const ticket = await consumeTicket(body.ticket);

    expect(ticket).toEqual({
      userId: 'account-123',
      displayName: 'bAlice/b',
    });
    expect(await consumeTicket(body.ticket)).toBeNull();
  });
});
