import type { Context, Next } from 'hono';
import { RATE_LIMITS } from '@bubbles/shared';

interface TokenBucket {
  tokens: number;
  lastRefill: number;
}

// Per-session, per-action buckets
const buckets = new Map<string, TokenBucket>();

// Hard cap: evict oldest entries when map exceeds this size
const MAX_BUCKETS = 10_000;

// Clean up stale buckets periodically and enforce hard cap
const CLEANUP_INTERVAL = 5 * 60 * 1000;
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (now - bucket.lastRefill > CLEANUP_INTERVAL) {
      buckets.delete(key);
    }
  }
  // If still over cap, evict oldest (Map insertion order)
  if (buckets.size > MAX_BUCKETS) {
    const overflow = buckets.size - MAX_BUCKETS;
    let i = 0;
    for (const key of buckets.keys()) {
      if (i++ >= overflow) break;
      buckets.delete(key);
    }
  }
}, CLEANUP_INTERVAL);

function getOrCreateBucket(key: string, maxTokens: number): TokenBucket {
  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { tokens: maxTokens, lastRefill: Date.now() };
    buckets.set(key, bucket);
  }
  return bucket;
}

function refillBucket(bucket: TokenBucket, maxTokens: number, refillRate: number): void {
  const now = Date.now();
  const elapsed = (now - bucket.lastRefill) / 1000; // seconds
  bucket.tokens = Math.min(maxTokens, bucket.tokens + elapsed * refillRate);
  bucket.lastRefill = now;
}

export function checkRateLimit(
  sessionId: string,
  action: 'blow' | 'pop' | 'createPlace' | 'set_color' | 'ping',
  isAuthenticated: boolean
): { allowed: boolean; retryAfter: number; remaining: number; limit: number } {
  const limits = isAuthenticated ? RATE_LIMITS.authenticated : RATE_LIMITS.anonymous;
  const maxTokens = limits[action];
  // Refill rate: full bucket per minute
  const refillRate = maxTokens / 60;

  const key = `${sessionId}:${action}`;
  const bucket = getOrCreateBucket(key, maxTokens);
  refillBucket(bucket, maxTokens, refillRate);

  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    return { allowed: true, retryAfter: 0, remaining: Math.floor(bucket.tokens), limit: maxTokens };
  }

  const retryAfter = Math.ceil((1 - bucket.tokens) / refillRate);
  return { allowed: false, retryAfter, remaining: 0, limit: maxTokens };
}

// Test helpers for clearing state and running cleanup synchronously
export function _testClearBuckets(): void {
  buckets.clear();
}

export function _testRunCleanup(): void {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (now - bucket.lastRefill > CLEANUP_INTERVAL) {
      buckets.delete(key);
    }
  }
  if (buckets.size > MAX_BUCKETS) {
    const overflow = buckets.size - MAX_BUCKETS;
    let i = 0;
    for (const key of buckets.keys()) {
      if (i++ >= overflow) break;
      buckets.delete(key);
    }
  }
}

export function rateLimiterMiddleware(action: 'blow' | 'pop' | 'createPlace' | 'set_color' | 'ping') {
  return async (c: Context, next: Next) => {
    const user = c.get('user');
    const result = checkRateLimit(user.sessionId, action, user.isAuthenticated);

    c.header('X-RateLimit-Limit', String(result.limit));
    c.header('X-RateLimit-Remaining', String(result.remaining));

    if (!result.allowed) {
      c.header('Retry-After', String(result.retryAfter));
      c.header('X-RateLimit-Reset', String(Math.ceil(Date.now() / 1000) + result.retryAfter));
      return c.json({ error: 'Too many requests', retryAfter: result.retryAfter }, 429);
    }

    await next();
  };
}
