# Security Review (R06)

**Scope**: Last 10 commits — Redis state, pub/sub, graceful shutdown, Prometheus metrics, mobile responsiveness, physics sync.
**Date**: 2026-03-24
**Reviewer**: Application Security (automated)

---

## Critical

### 1. JWT Token Exposed in WebSocket URL Query Parameter
- **File**: `apps/server/src/ws/handler.ts:57`, `apps/web/src/lib/ws-client.ts:52`
- **Description**: The JWT token is passed as a URL query parameter (`?token=<jwt>`) when establishing the WebSocket connection. URL parameters are logged by proxies, CDNs, load balancers, and browser history. They appear in server access logs, Cloudflare edge logs, and any intermediary that inspects URLs.
- **Impact**: Full account compromise. Any system logging request URLs captures the JWT, allowing impersonation of authenticated users.
- **Recommendation**: Pass the JWT via the first WebSocket message after connection (an `auth` message type), or use a short-lived, single-use ticket exchanged for a session server-side. If query parameter is unavoidable, use a one-time nonce that expires after first use (e.g., 10-second TTL in Redis).

### 2. Metrics Endpoint Exposed Without Authentication
- **File**: `apps/server/src/index.ts:24`, `apps/server/src/metrics.ts:120-124`
- **Description**: The `/metrics` endpoint is mounted on the public-facing Hono app with no authentication or IP restriction. It exposes internal counters including active WebSocket connections, room counts, user totals, HTTP request paths, status codes, and response times.
- **Impact**: Information disclosure enabling reconnaissance. Attacker learns exact user counts, room activity patterns, internal route structure, and can monitor the effect of their attacks in real time. In Kubernetes, the metrics endpoint should only be accessible to the Prometheus scraper (typically via a `PodMonitor` or `ServiceMonitor` on a separate port).
- **Recommendation**: Either (a) serve metrics on a separate port not exposed through the ingress, or (b) add IP-based or bearer-token authentication to the `/metrics` route. At minimum, exclude it from the public-facing router.

---

## High

### 3. Redis Connection Without TLS or Authentication
- **File**: `apps/server/src/db/redis.ts:17-33`
- **Description**: The Redis client connects using only `config.REDIS_URL` with no explicit TLS configuration. If `REDIS_URL` is `redis://...` (not `rediss://`), all traffic — including pub/sub messages containing user session IDs, display names, and room state — is sent in plaintext. There is no evidence of Redis ACLs or `requirepass` being configured.
- **Impact**: Network-level eavesdropping exposes all real-time user data. In a shared Kubernetes cluster or cloud VPC, any compromised pod can sniff Redis traffic or connect directly to the Redis instance.
- **Recommendation**: Enforce `rediss://` (TLS) in production. Add Redis AUTH via password in the URL or ioredis config. Add a startup check that rejects non-TLS Redis URLs when `NODE_ENV=production`.

### 4. No placeId Validation on WebSocket Connection Path
- **File**: `apps/server/src/index.ts:40`, `apps/server/src/ws/handler.ts:42`
- **Description**: The WebSocket upgrade path `/ws/place/:placeId` accepts any string as `placeId` without validating it is a valid MongoDB ObjectId or that the place exists. The `getOrCreateRoom` function in `rooms.ts:175` creates a room in memory for any arbitrary `placeId`. While `getPlaceName` catches invalid ObjectIds gracefully, the room is still created.
- **Impact**: An attacker can create unlimited in-memory rooms by connecting with random `placeId` values, causing memory exhaustion (DoS). Redis keys (`room:<arbitrary>:members`, `room:<arbitrary>:bubbles`) are also created for non-existent places.
- **Recommendation**: Validate `placeId` as a valid ObjectId format and verify the place exists in MongoDB before allowing the WebSocket upgrade. Return 404 for non-existent places in the HTTP upgrade middleware.

### 5. Weak Default Secrets in docker-compose.yml
- **File**: `docker-compose.yml:21-22`
- **Description**: `JWT_SECRET` and `SESSION_SECRET` default to `"changeme"` via shell variable expansion (`${JWT_SECRET:-changeme}`). If operators deploy using docker-compose without setting these variables, the application runs with known secrets.
- **Impact**: With a known `JWT_SECRET`, an attacker can forge arbitrary JWTs and impersonate any user. With a known `SESSION_SECRET`, session cookies can be forged.
- **Recommendation**: Remove the `:-changeme` defaults. Require explicit values or fail at startup. The server's `config.ts` already uses `requireEnv` for these — the docker-compose defaults bypass that protection.

### 6. No WebSocket Message Size Limit
- **File**: `apps/server/src/ws/handler.ts:124`
- **Description**: The `onMessage` handler parses incoming WebSocket data with `JSON.parse` without any size check. A malicious client can send multi-megabyte messages (e.g., a `set_name` message with a massive JSON payload) that consume server memory during parsing.
- **Impact**: Memory exhaustion / DoS. A single client can repeatedly send large payloads, impacting all users on the pod.
- **Recommendation**: Add a message size check before parsing: reject messages larger than a reasonable threshold (e.g., 4KB). Configure the WebSocket server's `maxPayload` if supported by Hono/Bun.

---

## Medium

### 7. Pub/Sub Channel Name Injection via Unsanitized placeId
- **File**: `apps/server/src/ws/pubsub.ts:18-19`, `apps/server/src/ws/rooms.ts:38-43`
- **Description**: Redis key and channel names are constructed via string interpolation (`room:${placeId}`, `room:${placeId}:members`, `room:${placeId}:bubbles`). Since `placeId` is not validated on the WebSocket path (see finding #4), an attacker could craft a `placeId` containing Redis key separators or glob patterns (e.g., `*`, `:members`) to collide with or match other keys during the `SCAN` cleanup.
- **Impact**: Redis key collision could corrupt room state for other places or cause the cleanup routine to delete legitimate member entries.
- **Recommendation**: Validate `placeId` as a strict 24-character hex string (MongoDB ObjectId format) before using it in any Redis key or channel name.

### 8. Cursor Data Not Validated for Type or Range
- **File**: `apps/server/src/ws/handler.ts:303-308`
- **Description**: The `cursor` message handler broadcasts `msg.data.x` and `msg.data.y` directly to all room clients without validating they are numbers or within reasonable bounds. A malicious client can send arbitrary data types (strings, objects) or extreme numeric values.
- **Impact**: Client-side rendering issues or logic errors in other connected clients. Could be used for XSS if a client renders cursor positions without sanitization (unlikely with React but defense-in-depth applies).
- **Recommendation**: Validate `x` and `y` are finite numbers within expected bounds (e.g., 0-1 for normalized coordinates). Reject or clamp out-of-range values.

### 9. `bubbleId` in Pop Message Not Validated for Format
- **File**: `apps/server/src/ws/handler.ts:216`
- **Description**: The `pop` handler reads `msg.data.bubbleId` and uses it as a Map key lookup. While the lookup itself is safe (Map.get returns undefined for missing keys), the `bubbleId` value is not validated as a UUID. It is also passed to Redis `hdel` in `redisRemoveBubble`. An attacker could send arbitrary strings that get passed through the system.
- **Impact**: Low direct impact since Map/Redis operations handle missing keys gracefully. However, if `bubbleId` is logged or included in future database queries, unsanitized input becomes a risk.
- **Recommendation**: Validate `bubbleId` matches UUID format before processing.

### 10. Rate Limiter is Per-Pod, Not Global
- **File**: `apps/server/src/middleware/rateLimiter.ts:10`
- **Description**: The rate limiter uses an in-memory `Map` of token buckets. In a multi-pod deployment (which this Redis pub/sub architecture supports), each pod maintains independent rate limits. An attacker can multiply their effective rate limit by N (number of pods) if traffic is round-robined.
- **Impact**: Rate limiting is significantly weakened in production multi-pod deployments, allowing abuse of blow/pop/createPlace actions beyond intended limits.
- **Recommendation**: Use Redis-backed rate limiting (e.g., sliding window counter in Redis) for production multi-pod deployments. The `ioredis` dependency is already available.

### 11. Session Verification Uses Non-Constant-Time Comparison
- **File**: `apps/server/src/utils/session.ts:39`
- **Description**: The `verifySession` function compares the signed session cookie with `signed !== expectedSigned` using JavaScript's `!==` operator, which is not constant-time. This could theoretically allow timing-based attacks to forge session signatures.
- **Impact**: In practice, the risk is low for HMAC-SHA256 with a strong secret, but it deviates from cryptographic best practices.
- **Recommendation**: Use `crypto.timingSafeEqual` (available in Bun) for comparing the signature portions.

---

## Low

### 12. No Connection Limit Per IP or Session
- **File**: `apps/server/src/ws/handler.ts:42-110`
- **Description**: There is no limit on the number of concurrent WebSocket connections from a single IP address or session. While the existing reconnect logic closes a prior connection for the same `sessionId`, an attacker can generate unlimited session IDs (each WS connection gets a new one generated at line 44).
- **Impact**: Resource exhaustion through connection flooding. Each connection creates entries in the in-memory `rooms` Map, `sessionStates` Map, and Redis.
- **Recommendation**: Add per-IP connection limits at the reverse proxy level (e.g., nginx `limit_conn`) or in the WebSocket upgrade middleware.

### 13. `lastCursorSent` Map Grows Unbounded
- **File**: `apps/server/src/ws/handler.ts:27`
- **Description**: The `lastCursorSent` Map is cleaned up on `onClose` and `onError`, but if a client disconnects ungracefully (no close frame), the entry for that session persists indefinitely. The map key includes `placeId:sessionId`.
- **Impact**: Slow memory leak over time in long-running pods with many ephemeral connections.
- **Recommendation**: Add periodic cleanup of stale `lastCursorSent` entries, or use a WeakRef-based approach tied to the session lifecycle.

### 14. displayName in Place Creator Not Stable
- **File**: `apps/server/src/routes/places.ts:79`
- **Description**: When creating a place, `createdBy` is set to `user.displayName`, which is a session-derived anonymous name. If the user changes their display name via `set_name`, the `createdBy` field is not updated. For authenticated users, this stores a potentially ephemeral display name rather than a stable user ID.
- **Impact**: Minor data integrity issue. Not a direct security vulnerability but affects accountability/auditability.
- **Recommendation**: Store `userId` (when authenticated) alongside `createdBy` for stable attribution.

### 15. Health Endpoint Exposes Uptime
- **File**: `apps/server/src/routes/health.ts:17-23`
- **Description**: The liveness probe returns `uptime` in seconds, which is useful information for attackers to determine when the server last restarted and estimate deployment patterns.
- **Impact**: Minor information disclosure for reconnaissance.
- **Recommendation**: Remove `uptime` from the public health response, or restrict the health endpoint to internal traffic only (Kubernetes probes don't need the response to be publicly accessible).

### 16. Place Name Not Sanitized for HTML/Script Content
- **File**: `apps/server/src/routes/places.ts:56`
- **Description**: Place names are trimmed and length-checked but not sanitized for HTML content. While React auto-escapes JSX output (mitigating XSS), if place names are ever rendered in non-React contexts (email notifications, admin panels, server-side logs), unsanitized HTML in place names could be exploited.
- **Impact**: Low risk due to React's auto-escaping, but defense-in-depth is missing.
- **Recommendation**: Apply the same sanitization used for `set_name` in `handler.ts:267` (strip `<>&"'` and control characters) to place names on creation.

---

## Summary

| Severity | Count | Key Themes |
|----------|-------|------------|
| Critical | 2     | JWT in URL, unauthenticated metrics |
| High     | 4     | Redis no TLS/auth, no placeId validation, weak defaults, no message size limit |
| Medium   | 5     | Key injection, input validation gaps, per-pod rate limiting, timing attack |
| Low      | 5     | Connection limits, memory leaks, info disclosure, data integrity |

**Top 3 Priorities**:
1. Move JWT out of WebSocket URL query parameters
2. Protect the `/metrics` endpoint from public access
3. Validate `placeId` format before WebSocket upgrade and add Redis TLS enforcement in production
