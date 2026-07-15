import { describe, it, expect, beforeAll } from 'bun:test';
import { Hono } from 'hono';
import { SignJWT } from 'jose';
import { authMiddleware } from '../middleware/auth';

describe('authMiddleware', () => {
  let app: Hono;

  beforeAll(() => {
    app = new Hono();
    app.use('*', authMiddleware);
    app.get('/', (c) => c.json(c.get('user')));
  });

  it('parses valid JWT token', async () => {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET!);
    const token = await new SignJWT({ sub: 'user123', name: 'Alice' })
      .setProtectedHeader({ alg: 'HS256' })
      .sign(secret);

    const res = await app.fetch(
      new Request('http://localhost/', {
        headers: { Authorization: `Bearer ${token}` },
      })
    );
    expect(res.status).toBe(200);
    const user = await res.json();
    expect(user.userId).toBe('user123');
    expect(user.displayName).toBe('Alice');
    expect(user.isAuthenticated).toBe(true);
    expect(user.ownerId).toStartWith('owner_v1_');
    expect(user.ownerId).not.toContain('user123');
  });

  it('requires a stable JWT subject before treating a request as authenticated', async () => {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET!);
    const token = await new SignJWT({ name: 'Alice' })
      .setProtectedHeader({ alg: 'HS256' })
      .sign(secret);

    const res = await app.fetch(
      new Request('http://localhost/', {
        headers: { Authorization: `Bearer ${token}` },
      })
    );
    expect(res.status).toBe(200);
    const user = await res.json();
    expect(user.userId).toBeUndefined();
    expect(user.isAuthenticated).toBe(false);
    expect(user.displayName).not.toBe('Alice');
    expect(user.ownerId).toStartWith('owner_v1_');
  });

  it('falls through to anonymous with invalid token', async () => {
    const res = await app.fetch(
      new Request('http://localhost/', {
        headers: { Authorization: 'Bearer invalid-token' },
      })
    );
    expect(res.status).toBe(200);
    const user = await res.json();
    expect(user.isAuthenticated).toBe(false);
    expect(user.displayName).not.toBe('');
    expect(user.sessionId).toBeDefined();
  });

  it('creates session cookie when none provided', async () => {
    const res = await app.fetch(new Request('http://localhost/'));
    expect(res.status).toBe(200);
    const setCookie = res.headers.get('Set-Cookie');
    expect(setCookie).toBeTruthy();
    expect(setCookie).toContain('bubbles_session=');
  });

  it('sanitizes displayName from JWT payload', async () => {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET!);
    const token = await new SignJWT({
      sub: 'user123',
      name: '<script>alert(1)</script>',
    })
      .setProtectedHeader({ alg: 'HS256' })
      .sign(secret);

    const res = await app.fetch(
      new Request('http://localhost/', {
        headers: { Authorization: `Bearer ${token}` },
      })
    );
    expect(res.status).toBe(200);
    const user = await res.json();
    expect(user.displayName).not.toContain('<');
    expect(user.displayName).not.toContain('>');
    expect(user.displayName).toBe('scriptalert(1)/script');
  });

  it('assigns deterministic color from sessionId', async () => {
    const res1 = await app.fetch(new Request('http://localhost/'));
    expect(res1.status).toBe(200);
    const user1 = await res1.json();

    // Extract session cookie from first response
    const rawCookie = res1.headers.get('Set-Cookie') || '';
    const match = rawCookie.match(/bubbles_session=([^;]+)/);
    expect(match).toBeTruthy();
    const sessionCookie = match![1];

    // Second request with same session cookie
    const res2 = await app.fetch(
      new Request('http://localhost/', {
        headers: { Cookie: `bubbles_session=${sessionCookie}` },
      })
    );
    expect(res2.status).toBe(200);
    const user2 = await res2.json();

    expect(user2.color).toBe(user1.color);
    expect(user2.sessionId).toBe(user1.sessionId);
    expect(user2.displayName).toBe(user1.displayName);
    expect(user2.ownerId).toBe(user1.ownerId);
  });

  it('keeps an authenticated owner stable across cookie sessions', async () => {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET!);
    const firstToken = await new SignJWT({
      sub: 'stable-user',
      name: 'First Name',
    })
      .setProtectedHeader({ alg: 'HS256' })
      .sign(secret);
    const renamedToken = await new SignJWT({
      sub: 'stable-user',
      name: 'New Name',
    })
      .setProtectedHeader({ alg: 'HS256' })
      .sign(secret);

    const first = await app.fetch(
      new Request('http://localhost/', {
        headers: { Authorization: `Bearer ${firstToken}` },
      })
    );
    const second = await app.fetch(
      new Request('http://localhost/', {
        headers: { Authorization: `Bearer ${renamedToken}` },
      })
    );
    const firstUser = await first.json();
    const secondUser = await second.json();

    expect(secondUser.sessionId).not.toBe(firstUser.sessionId);
    expect(secondUser.displayName).toBe('New Name');
    expect(secondUser.ownerId).toBe(firstUser.ownerId);
  });
});
