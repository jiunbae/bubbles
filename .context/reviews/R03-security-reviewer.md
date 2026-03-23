# R03 - Security Review

**Reviewer:** AppSec Engineer (Claude)
**Date:** 2026-03-23
**Scope:** Full-stack security audit of Bubbles multiplayer web app
**Files reviewed:** `apps/server/src/ws/handler.ts`, `apps/server/src/middleware/auth.ts`, `apps/server/src/middleware/rateLimiter.ts`, `apps/server/src/middleware/cors.ts`, `apps/server/src/routes/places.ts`, `apps/server/src/routes/logs.ts`, `apps/server/src/config.ts`, `apps/server/.env`, `apps/server/src/utils/session.ts`, `apps/server/src/ws/rooms.ts`, `apps/server/src/index.ts`, `apps/web/nginx.conf`, `apps/web/src/lib/ws-client.ts`, `apps/web/src/providers/WebSocketProvider.tsx`, `docker-compose.yml`, `apps/server/Dockerfile`, `apps/web/Dockerfile`, `.dockerignore`, `.gitignore`

---

## Secrets Management

### S01 — Hardcoded Secrets in docker-compose.yml
**Severity:** critical
**Description:** Production secrets (`JWT_SECRET` and `SESSION_SECRET`) are hardcoded directly in `docker-compose.yml` with weak placeholder values (`"your-secret-here"` and `"bubbles-session-secret"`). This file is checked into source control. The `JWT_SECRET` value `"your-secret-here"` is only 15 characters and trivially guessable. The `SESSION_SECRET` value `"bubbles-session-secret"` is similarly weak. If these are the actual production values, any attacker can forge JWTs and session cookies.
**Location:** `docker-compose.yml:23-24`
**Fix:** Remove hardcoded secrets from `docker-compose.yml`. Use Docker secrets, an `.env` file excluded from git (already in `.gitignore`), or a secrets manager. Reference secrets via `${JWT_SECRET}` and `${SESSION_SECRET}` environment variable interpolation. Generate cryptographically strong secrets (minimum 32 bytes of random data).

### S02 — Weak Default Secrets in .env Template
**Severity:** high
**Description:** The `.env` file contains `JWT_SECRET=your-secret-here` and `SESSION_SECRET=bubbles-session-secret`. While `.env` is in `.gitignore`, these values are clearly placeholder/dev defaults. If a developer copies this file to production without changing them, or if the `docker-compose.yml` hardcoded values are used, all auth is compromised.
**Location:** `apps/server/.env:3-4`
**Fix:** Use clearly marked placeholders like `JWT_SECRET=CHANGE_ME_GENERATE_WITH_openssl_rand_hex_32` and add a startup check in `config.ts` that rejects known-weak values in production mode.

---

## Authentication & Session Management

### S03 — JWT Token Passed in WebSocket URL Query String
**Severity:** high
**Description:** The JWT token is passed as a query parameter (`?token=...`) in the WebSocket connection URL. Query parameters are logged by web servers (nginx access logs), proxies, CDNs (Cloudflare), and appear in browser history. This exposes the JWT in plaintext across the infrastructure.
**Location:** `apps/web/src/lib/ws-client.ts:46`, `apps/server/src/ws/handler.ts:41`
**Fix:** Pass the JWT via the first WebSocket message after connection, or use a short-lived opaque ticket: the client exchanges the JWT for a single-use connection ticket via REST, then passes the ticket in the URL. The ticket expires in seconds and is invalidated after first use.

### S04 — No WebSocket Origin Validation
**Severity:** medium
**Description:** The WebSocket upgrade handler (`/ws/place/:placeId`) does not validate the `Origin` header. While CORS middleware is applied globally, CORS does not protect WebSocket upgrades — browsers do not enforce CORS on WebSocket connections. Any webpage on any domain can open a WebSocket to the server and interact with the bubble system.
**Location:** `apps/server/src/index.ts:25-31`
**Fix:** Add explicit `Origin` header validation in the WebSocket upgrade path. Check the `Origin` header from `c.req.header('Origin')` against the allowed origins list before upgrading:
```ts
const origin = c.req.header('Origin');
if (!origin || !isAllowedOrigin(origin)) {
  return c.text('Forbidden', 403);
}
```

### S05 — Session Cookie with SameSite=None in Production
**Severity:** medium
**Description:** The session cookie is set with `sameSite: 'None'` in production. While this is needed for cross-origin cookie sending, it makes the cookie susceptible to CSRF attacks. Combined with the anonymous session model (no CSRF tokens), any site can make credentialed requests to the API.
**Location:** `apps/server/src/middleware/auth.ts:61`
**Fix:** If the frontend and API are served from the same origin via the nginx proxy (which they are — both on `bubbles.jiun.dev`), use `sameSite: 'Lax'` in production instead of `'None'`. If cross-origin is truly needed, implement CSRF token validation on state-changing endpoints.

### S06 — No Limit on Concurrent WebSocket Connections per Session/IP
**Severity:** medium
**Description:** There is no limit on how many WebSocket connections a single client/IP can open. An attacker can exhaust server memory by opening thousands of connections. The room system replaces duplicate sessions within a room, but a single client can join every room simultaneously.
**Location:** `apps/server/src/ws/handler.ts`, `apps/server/src/ws/rooms.ts`
**Fix:** Track connection count per IP address and per session. Reject new WebSocket upgrades above a threshold (e.g., 5 per IP, 3 per session). Implement at the Hono middleware level before the upgrade.

---

## Input Validation & Injection

### S07 — Insufficient Input Validation on Bubble Color Field
**Severity:** medium
**Description:** The bubble `color` field from the client is accepted as any string (`typeof color === 'string' ? color : '#87CEEB'`). While this is rendered client-side and not directly inserted into HTML, arbitrary strings in broadcast messages could contain payloads that exploit downstream consumers (other clients, log viewers, analytics tools). The `BUBBLE_COLORS` constant is imported but not used for validation.
**Location:** `apps/server/src/ws/handler.ts:159`
**Fix:** Validate the color against the `BUBBLE_COLORS` allowlist that is already imported:
```ts
const validColor = BUBBLE_COLORS.includes(color) ? color : '#87CEEB';
```

### S08 — No Validation on Bubble Coordinate Bounds
**Severity:** low
**Description:** Client-provided `x`, `y`, `z` coordinates are accepted as any number without bounds checking. A malicious client could send `Infinity`, `NaN`, or extremely large values that could cause rendering issues for all connected clients.
**Location:** `apps/server/src/ws/handler.ts:142-145`
**Fix:** Clamp coordinates to reasonable bounds and reject `NaN`/`Infinity`:
```ts
const isValidCoord = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v) && Math.abs(v) < 100;
```

### S09 — No Message Size Limit on WebSocket
**Severity:** medium
**Description:** There is no maximum message size enforced on incoming WebSocket messages. An attacker can send multi-megabyte JSON payloads to cause high memory usage and CPU consumption during `JSON.parse()`.
**Location:** `apps/server/src/ws/handler.ts:104-106`
**Fix:** Check `event.data.length` (or `byteLength`) before parsing and reject messages exceeding a reasonable limit (e.g., 4 KB). Configure Bun's WebSocket `maxPayloadLength` option if available.

### S10 — placeId Not Validated on WebSocket Connect
**Severity:** low
**Description:** The `placeId` parameter from the WebSocket URL is not validated as a valid MongoDB ObjectId before use. While `getOrCreateRoom` accepts any string, and `getPlaceName` catches errors from invalid ObjectId construction, a room is still created in memory for arbitrary placeId strings.
**Location:** `apps/server/src/ws/handler.ts:28`, `apps/server/src/index.ts:28`
**Fix:** Validate that `placeId` is a valid 24-character hex string (ObjectId format) before upgrading the connection. Optionally verify the place exists in the database.

---

## Denial of Service

### S11 — No Server-Side Bubble Count Limit per Room
**Severity:** medium
**Description:** The client enforces `MAX_BUBBLES = 80`, but there is no server-side limit on bubbles per room. A malicious client bypassing the UI can flood a room with bubbles up to the rate limit (~30/minute authenticated), creating thousands of active timers and broadcasting creation messages to all clients.
**Location:** `apps/server/src/ws/rooms.ts:193-207`
**Fix:** Add a server-side bubble cap (e.g., 100 per room). Reject new bubbles when the limit is reached:
```ts
if (room.bubbles.size >= MAX_BUBBLES_PER_ROOM) return;
```

### S12 — In-Memory Rate Limiter Does Not Survive Restarts
**Severity:** low
**Description:** Rate limiting state is stored in a JavaScript `Map` and lost on server restart. An attacker can trigger a restart (if they find a crash vector) to reset all rate limits. Also, in a multi-instance deployment, each instance would have independent rate limiting.
**Location:** `apps/server/src/middleware/rateLimiter.ts:10`
**Fix:** For the current single-instance deployment this is acceptable. If scaling horizontally, move rate limit state to Redis. Consider this a known limitation.

### S13 — cursor_moved Messages Not Rate Limited Per Action Type
**Severity:** low
**Description:** Cursor messages are throttled to 10/sec via timestamp checking, but this is not enforced through the rate limiter. The throttle is per-connection only — a client with multiple connections could multiply cursor broadcasts.
**Location:** `apps/server/src/ws/handler.ts:239-257`
**Fix:** This is low risk given cursor messages are lightweight. For hardening, apply the throttle per sessionId globally rather than per-connection.

---

## Infrastructure & Docker

### S14 — MongoDB Exposed on Host Port Without Authentication
**Severity:** high
**Description:** MongoDB is exposed on host port 27017 (`ports: "27017:27017"`) with no authentication configured. Any process on the host (or any network-adjacent attacker if the host has open firewall rules) can connect to MongoDB and read/write/delete all data.
**Location:** `docker-compose.yml:4-5`
**Fix:** Remove the port mapping if the host does not need direct access (server connects via the Docker network as `mongo:27017`). If host access is needed for debugging, bind to localhost only: `"127.0.0.1:27017:27017"`. Additionally, configure MongoDB authentication with `MONGO_INITDB_ROOT_USERNAME` and `MONGO_INITDB_ROOT_PASSWORD`.

### S15 — Server Port Exposed on Host
**Severity:** low
**Description:** The server container exposes port 3002 on the host (`ports: "3002:3001"`). Since nginx proxies to the server internally via the Docker network, this external exposure is unnecessary and creates a second entry point that bypasses nginx (and any nginx-level security headers or rate limiting).
**Location:** `docker-compose.yml:19`
**Fix:** Remove the port mapping or bind to localhost: `"127.0.0.1:3002:3001"`. The web container already proxies to `server:3001` via the Docker network.

### S16 — No Security Headers in nginx
**Severity:** medium
**Description:** The nginx configuration does not set any security headers. Missing headers include: `X-Content-Type-Options`, `X-Frame-Options`, `Content-Security-Policy`, `Strict-Transport-Security`, `Referrer-Policy`, `Permissions-Policy`.
**Location:** `apps/web/nginx.conf`
**Fix:** Add security headers:
```nginx
add_header X-Content-Type-Options "nosniff" always;
add_header X-Frame-Options "DENY" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;
# HSTS is typically handled by Cloudflare, but can be added here too
```

### S17 — Docker Containers Run as Root
**Severity:** medium
**Description:** Neither the server Dockerfile nor the web Dockerfile specifies a non-root user. Both the Bun server and nginx run as root inside their containers. If an attacker achieves code execution, they have root privileges within the container.
**Location:** `apps/server/Dockerfile:24-28`, `apps/web/Dockerfile:20-23`
**Fix:** Add `USER` directives. For the server: `RUN adduser --disabled-password --no-create-home appuser && USER appuser`. For nginx, the `nginx:alpine` image supports running as non-root with `user nginx;` in the config.

---

## Information Disclosure

### S18 — Session ID Leaked to All Room Participants
**Severity:** medium
**Description:** When a user blows or pops a bubble, their `sessionId` is broadcast to every client in the room via `bubble_created` and `bubble_popped` messages. The session ID is used for session cookie signing — knowing it doesn't directly allow session hijacking (the HMAC signature is also needed), but it leaks a persistent user identifier and reduces the entropy an attacker needs to forge a session.
**Location:** `apps/server/src/ws/handler.ts:149-154`, `apps/server/src/ws/rooms.ts:75-80`
**Fix:** Use a derived public identifier (e.g., a hash of the sessionId) for broadcast messages instead of the raw sessionId. Keep the real sessionId server-side only.

### S19 — Action Logs Endpoint Has No Authorization
**Severity:** medium
**Description:** The `/logs/places/:placeId/logs` endpoint is protected by `authMiddleware`, but since auth is purely session-based and every visitor gets a session automatically, any anonymous user can read all action logs for any place. This exposes user activity history (who blew/popped bubbles, when they joined/left).
**Location:** `apps/server/src/routes/logs.ts:22`
**Fix:** Determine if logs should be public. If not, restrict access to authenticated users (`user.isAuthenticated`) or to the place creator. At minimum, exclude `sessionId` from the API response (it's already excluded in the current mapping, which is good).

---

## Session Security

### S20 — Session Verification Uses Non-Constant-Time Comparison
**Severity:** low
**Description:** The `verifySession` function compares the signed session using strict equality (`signed !== expectedSigned`). String comparison in JavaScript is not constant-time and is theoretically vulnerable to timing attacks, allowing an attacker to guess the HMAC signature byte by byte.
**Location:** `apps/server/src/utils/session.ts:39`
**Fix:** Use a constant-time comparison:
```ts
import { timingSafeEqual } from 'crypto';
const a = Buffer.from(signed);
const b = Buffer.from(expectedSigned);
if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
```

---

## Summary

| # | Finding | Severity | Category |
|---|---------|----------|----------|
| S01 | Hardcoded secrets in docker-compose.yml | **Critical** | Secrets |
| S02 | Weak default secrets in .env | High | Secrets |
| S03 | JWT token in WebSocket query string | High | Auth |
| S14 | MongoDB exposed without authentication | High | Infrastructure |
| S04 | No WebSocket Origin validation | Medium | Auth |
| S05 | SameSite=None cookie in production | Medium | Session |
| S06 | No concurrent connection limit | Medium | DoS |
| S07 | Unvalidated bubble color field | Medium | Input Validation |
| S09 | No WebSocket message size limit | Medium | DoS |
| S11 | No server-side bubble cap | Medium | DoS |
| S16 | Missing security headers in nginx | Medium | Infrastructure |
| S17 | Containers run as root | Medium | Infrastructure |
| S18 | Session ID leaked to room participants | Medium | Info Disclosure |
| S19 | Logs endpoint has no authorization | Medium | Auth |
| S08 | No coordinate bounds validation | Low | Input Validation |
| S10 | placeId not validated on WS connect | Low | Input Validation |
| S12 | In-memory rate limiter volatility | Low | DoS |
| S13 | Cursor throttle per-connection only | Low | DoS |
| S15 | Server port unnecessarily exposed | Low | Infrastructure |
| S20 | Non-constant-time session comparison | Low | Session |

**Priority order for remediation:**
1. S01 + S02 — Fix production secrets immediately
2. S14 — Secure MongoDB access
3. S03 — Stop leaking JWT in URLs
4. S04 — Add WebSocket Origin validation
5. S16 + S17 — Infrastructure hardening
6. S06 + S09 + S11 — DoS protections
7. Remaining medium/low items
