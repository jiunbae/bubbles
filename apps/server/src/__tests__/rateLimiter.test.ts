import { describe, it, expect, beforeEach } from 'bun:test';
import { Hono } from 'hono';
import {
  checkRateLimit,
  rateLimiterMiddleware,
  _testClearBuckets,
  _testRunCleanup,
} from '../middleware/rateLimiter';

function createTestApp(sessionId: string, isAuthenticated: boolean) {
  const app = new Hono();
  app.use('*', async (c, next) => {
    (c as any).set('user', {
      sessionId,
      displayName: 'Test',
      isAuthenticated,
      color: '#FFB5C2',
    });
    await next();
  });
  return app;
}

describe('rateLimiter', () => {
  beforeEach(() => {
    _testClearBuckets();
  });

  describe('checkRateLimit', () => {
    it('allows requests within the limit', () => {
      const result = checkRateLimit('session-allow', 'blow', false);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(199);
      expect(result.limit).toBe(200);
    });

    it('blocks requests exceeding the limit', () => {
      const sessionId = 'session-block';
      for (let i = 0; i < 200; i++) {
        checkRateLimit(sessionId, 'blow', false);
      }
      const result = checkRateLimit(sessionId, 'blow', false);
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.retryAfter).toBeGreaterThan(0);
    });

    it('authenticated users get higher limits', () => {
      const anon = checkRateLimit('session-anon', 'createPlace', false);
      const auth = checkRateLimit('session-auth', 'createPlace', true);
      expect(auth.limit).toBeGreaterThan(anon.limit);
      expect(auth.limit).toBe(20);
      expect(anon.limit).toBe(5);
    });

    it('tokens refill after waiting', () => {
      const realDateNow = Date.now;
      const baseTime = realDateNow();
      global.Date.now = () => baseTime;

      try {
        const sessionId = 'session-refill';
        for (let i = 0; i < 200; i++) {
          checkRateLimit(sessionId, 'blow', false);
        }
        expect(checkRateLimit(sessionId, 'blow', false).allowed).toBe(false);

        global.Date.now = () => baseTime + 2000;

        const result = checkRateLimit(sessionId, 'blow', false);
        expect(result.allowed).toBe(true);
        expect(result.remaining).toBeGreaterThan(0);
      } finally {
        global.Date.now = realDateNow;
      }
    });

    it('cleanup interval removes stale buckets', () => {
      const realDateNow = Date.now;
      const baseTime = realDateNow();
      global.Date.now = () => baseTime;

      try {
        checkRateLimit('session-stale', 'blow', false);
        global.Date.now = () => baseTime + 5 * 60 * 1000 + 1000;
        _testRunCleanup();

        const result = checkRateLimit('session-stale', 'blow', false);
        expect(result.allowed).toBe(true);
        expect(result.remaining).toBe(199);
      } finally {
        global.Date.now = realDateNow;
      }
    });

    it('MAX_BUCKETS cap evicts oldest entries', () => {
      for (let i = 0; i < 10001; i++) {
        checkRateLimit(`session-cap-${i}`, 'blow', false);
      }

      _testRunCleanup();

      const result = checkRateLimit('session-cap-0', 'blow', false);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(199);
    });
  });

  describe('rateLimiterMiddleware', () => {
    it('sets rate limit headers and passes through when allowed', async () => {
      const app = createTestApp('session-mw-allow', false);
      app.get('/test', rateLimiterMiddleware('blow'), (c) => c.text('OK'));

      const res = await app.fetch(new Request('http://localhost/test'));
      expect(res.status).toBe(200);
      expect(await res.text()).toBe('OK');
      expect(res.headers.get('X-RateLimit-Limit')).toBe('200');
      expect(res.headers.get('X-RateLimit-Remaining')).toBe('199');
    });

    it('returns 429 with retry headers when blocked', async () => {
      const app = createTestApp('session-mw-block', false);
      app.get('/test', rateLimiterMiddleware('createPlace'), (c) => c.text('OK'));

      // Exhaust the anonymous createPlace limit (5)
      for (let i = 0; i < 5; i++) {
        await app.fetch(new Request('http://localhost/test'));
      }

      const res = await app.fetch(new Request('http://localhost/test'));
      expect(res.status).toBe(429);
      const body = await res.json();
      expect(body.error).toBe('Too many requests');
      expect(body.retryAfter).toBeGreaterThan(0);
      expect(res.headers.get('Retry-After')).toBeTruthy();
      expect(res.headers.get('X-RateLimit-Reset')).toBeTruthy();
    });
  });
});
