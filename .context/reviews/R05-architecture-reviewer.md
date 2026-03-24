## Architecture Review (R05)

Reviewer: Principal Software Architect
Scope: Last 10 commits (anonymous rename, OAuth, Redis pub/sub, i18n, visual improvements, reconnection)

---

### 1. JWT token passed as WebSocket query parameter
- **Severity**: high
- **Description**: The JWT access token is appended to the WebSocket URL as a query parameter (`?token=...`). Query parameters are logged in HTTP access logs, browser history, proxy logs, and CDN edge logs. This exposes credentials in plaintext across the infrastructure. The token is also visible in browser developer tools Network tab for anyone with physical access.
- **Location**: `apps/web/src/lib/ws-client.ts:52`, `apps/server/src/ws/handler.ts:56-57`
- **Suggestion**: Since WebSocket does not support custom headers during the handshake from browsers, the common mitigation is a short-lived ticket exchange: (1) POST to an HTTP endpoint with the JWT in an Authorization header to get a single-use, short-TTL (e.g., 30s) opaque ticket, (2) pass that ticket as the query param for WS upgrade. The server validates and invalidates the ticket on first use. This limits the exposure window.

### 2. Silent catch on JWT verification failure
- **Severity**: high
- **Description**: When JWT verification fails in the WebSocket `onOpen` handler, the error is silently swallowed with an empty `catch {}`. The user is silently downgraded to an anonymous session with no indication that their authentication failed. This masks expired tokens, revoked tokens, and potential attack attempts.
- **Location**: `apps/server/src/ws/handler.ts:69`
- **Suggestion**: Log the JWT verification failure (at minimum the error class/type, not the token itself). Send an `error` message to the client with code `AUTH_FAILED` before falling back to anonymous mode, so the client can prompt re-authentication. Consider closing the connection for certain failure modes (e.g., malformed token).

### 3. Client-controlled `expiresAt` allows arbitrarily long-lived bubbles
- **Severity**: high
- **Description**: The server accepts `expiresAt` from the client message and clamps the *remaining duration* to 3s-60s, but it uses the client-provided `expiresAt` directly as the stored value (line 165). If a client sends an `expiresAt` far in the future along with a `createdAt`-appropriate timestamp, the clamping only affects the timer duration, not the stored `expiresAt`. The stored `expiresAt` on line 165 bypasses the clamp, allowing a bubble to persist in Redis indefinitely since `getRedisBubbles` filters by `b.expiresAt > now`.
- **Location**: `apps/server/src/ws/handler.ts:143-165`
- **Suggestion**: Always compute `expiresAt` server-side: `const expiresAt = now + clampedDuration`. Never trust the client value for storage. Use the client value only as a hint for determining the desired duration.

### 4. rooms.ts violates Single Responsibility Principle
- **Severity**: medium
- **Description**: `rooms.ts` (483 lines) handles room lifecycle, client management, bubble lifecycle, Redis state sync, MongoDB place lookups, metrics updates, and scheduled deletion logic. This makes it difficult to test, reason about, or modify any single concern without risking regression in others.
- **Location**: `apps/server/src/ws/rooms.ts`
- **Suggestion**: Extract into focused modules: (1) `room-state.ts` for in-memory room/client management, (2) `room-redis.ts` for Redis sync operations, (3) `bubble-manager.ts` for bubble lifecycle (create, expire, remove), (4) keep `rooms.ts` as a thin orchestrator. Each module can be tested independently.

### 5. handler.ts has god-function switch statement
- **Severity**: medium
- **Description**: `onMessage` is a monolithic switch statement handling all message types with inline business logic (rate limiting, validation, bubble creation, broadcasting). Each case block is 20-40 lines of mixed concerns. Adding a new message type requires modifying this single function.
- **Location**: `apps/server/src/ws/handler.ts:98-288`
- **Suggestion**: Extract each message type into a dedicated handler function (e.g., `handleBlow`, `handlePop`, `handleSetName`, `handleCursor`). These can live in the same file or be split into a `handlers/` directory. The switch statement becomes a thin dispatcher.

### 6. Circular module dependency between rooms.ts and pubsub.ts
- **Severity**: medium
- **Description**: `rooms.ts` imports from `pubsub.ts` (`publishToRoom`, `subscribeRoom`, `unsubscribeRoom`), and `pubsub.ts` imports from `rooms.ts` (`broadcastToLocalClients`, `getRoom`). This circular dependency works in practice because Node/bundlers handle it, but it creates tight coupling and makes the dependency graph hard to reason about. It also makes it impossible to test either module in isolation.
- **Location**: `apps/server/src/ws/rooms.ts:10`, `apps/server/src/ws/pubsub.ts:8`
- **Suggestion**: Introduce a dependency inversion: `pubsub.ts` should not import from `rooms.ts`. Instead, `initPubSub` should accept a callback (or event emitter) for relaying messages to local clients. The wiring happens at the composition root (e.g., `index.ts`). Alternatively, extract a shared interface that both modules depend on.

### 7. Redis "fire-and-forget" writes create silent state divergence
- **Severity**: medium
- **Description**: All Redis write operations (`redisAddMember`, `redisRemoveMember`, `redisAddBubble`, `redisRemoveBubble`) are called without `await` in `joinRoom`, `leaveRoom`, `createBubble`, and `removeBubble`. If a Redis write fails, the local state and Redis state silently diverge. The `cleanupRedisStaleEntries` function mitigates this for members (via `podId` matching) but not for bubbles from other pods.
- **Location**: `apps/server/src/ws/rooms.ts:215` (and similar calls at lines 261, 353, 368)
- **Suggestion**: At minimum, await the Redis calls so that errors propagate and can be handled (even if the handling is just a warning log, which is already in the catch blocks). For stronger consistency, consider a reconciliation loop that periodically diffs local state against Redis and corrects drift.

### 8. `cleanupRedisStaleEntries` uses `KEYS` command in production
- **Severity**: medium
- **Description**: `redis.keys('room:*:members')` and `redis.keys('room:*:bubbles')` are O(N) against the entire keyspace. In a production Redis with many keys, this blocks the Redis event loop and can cause latency spikes or timeouts for all other operations on the same instance.
- **Location**: `apps/server/src/ws/rooms.ts:402-419`
- **Suggestion**: Use `SCAN` with a cursor-based iteration instead of `KEYS`. Alternatively, maintain a Redis Set of active room IDs (e.g., `active_rooms`) and iterate over that set, which is bounded by the number of rooms rather than the entire keyspace.

### 9. Dual session ID sources create identity confusion
- **Severity**: medium
- **Description**: The client generates a `sessionId` via `getSessionId()` in `auth-store.ts` (persisted in `sessionStorage`), but the server generates its own `sessionId` via `generateSessionId()` in the WS handler. The client's session ID is never used by the server; the server's session ID is communicated back via `room_state.mySessionId`. The client-side `sessionId` in the auth store is dead state that could mislead future developers.
- **Location**: `apps/web/src/stores/auth-store.ts:13,24`, `apps/web/src/lib/token.ts:16-22`, `apps/server/src/ws/handler.ts:44`
- **Suggestion**: Remove the client-side `sessionId` generation entirely. The canonical session ID is always server-assigned. If a client-side ID is needed before the WS connects (e.g., for optimistic UI), document it clearly and ensure it is replaced once `room_state` arrives.

### 10. `set_name` does not sanitize display name input
- **Severity**: medium
- **Description**: The `set_name` handler trims and truncates to 30 characters but does not sanitize for HTML/script injection, control characters, or homoglyph abuse. While React will escape output in JSX, the name is also stored in Redis and broadcast to all clients. If any consumer renders outside React (logs, admin dashboards, push notifications), XSS is possible.
- **Location**: `apps/server/src/ws/handler.ts:234-235`
- **Suggestion**: Strip control characters (U+0000-U+001F, U+007F-U+009F) and optionally restrict to a safe character set. Add a profanity/abuse filter if appropriate for the product. Log renamed events for abuse detection.

### 11. `as any` cast bypasses TypeScript safety on blow message
- **Severity**: medium
- **Description**: The `msg.data` in the `blow` handler is cast to `any` on line 134, defeating TypeScript's discriminated union narrowing that would otherwise guarantee type safety. The `ClientMessage` type already provides a correctly typed `data` field for `type: 'blow'`.
- **Location**: `apps/server/src/ws/handler.ts:134`
- **Suggestion**: Remove the `as any` cast. TypeScript should narrow `msg.data` correctly when `msg.type === 'blow'`. Destructure directly from `msg.data`.

### 12. Duplicate bubble expiry timers between client sources
- **Severity**: medium
- **Description**: When a remote `bubble_created` message arrives, the `WebSocketProvider` sets a `setTimeout` to call `removeBubble` after the TTL (line 53-54). Separately, the server sends a `bubble_expired` event when its own timer fires, which the client handles via `popBubble`. This means every remote bubble has two independent expiry paths that can race, causing either a double-removal attempt or a visual glitch where a bubble disappears and then a pop effect plays on a missing bubble.
- **Location**: `apps/web/src/providers/WebSocketProvider.tsx:52-55`, `apps/web/src/providers/WebSocketProvider.tsx:62-63`
- **Suggestion**: Remove the client-side expiry timer for remote bubbles in WebSocketProvider. Rely solely on the server's `bubble_expired` event for authoritative removal. If the server is slow, add a generous client-side safety timeout (e.g., 2x the expected lifetime) as a fallback only.

### 13. Module-level mutable singleton for Redis connections
- **Severity**: low
- **Description**: `redis.ts` uses module-level `let` variables (`redis`, `sub`) as singletons, accessed via getter functions. This makes testing difficult (no way to inject mocks), creates hidden global state, and means `connectRedis()` silently overwrites any existing connection without closing it.
- **Location**: `apps/server/src/db/redis.ts:4-5`
- **Suggestion**: Wrap Redis connections in a class or factory that can be instantiated per test. Export a default instance for production use but allow injection. Add a guard in `connectRedis` to prevent double-initialization.

### 14. `ActiveBubble.id` vs `BubbleInfo.bubbleId` naming inconsistency
- **Severity**: low
- **Description**: The server-side `ActiveBubble` type uses `id` for the bubble identifier, while the shared `BubbleInfo` type uses `bubbleId`. This requires manual field renaming at every boundary (e.g., `getRedisBubbles` maps `b.id` to `bubbleId`). This is error-prone and has already led to the Redis storage using `id` while cross-pod consumers expect `bubbleId`.
- **Location**: `apps/server/src/ws/rooms.ts:13` vs `packages/shared/src/types.ts:9`, mapping at `rooms.ts:127`
- **Suggestion**: Align on a single name. Prefer `bubbleId` everywhere since it is the public API contract. Update `ActiveBubble` to use `bubbleId` and eliminate the mapping code.

### 15. `lastCursorSent` map in handler.ts leaks memory
- **Severity**: low
- **Description**: The `lastCursorSent` map is keyed by `${placeId}:${sessionId}`. The `onClose` handler cleans up the entry, but `onError` also performs cleanup (and is called before `onClose` in many WebSocket implementations). If `onError` fires and cleans up state from `sessionStates`, but the cursor entry was already removed, that is fine. However, if `onClose` does NOT fire after `onError` (implementation-dependent), the `lastCursorSent` entry is cleaned in `onClose` but `sessionStates` was already cleaned in `onError`. The inconsistency between `onError` and `onClose` cleanup paths means entries may leak.
- **Location**: `apps/server/src/ws/handler.ts:27`, cleanup at `299` and `311`
- **Suggestion**: Consolidate cleanup into a single `cleanupSession(sessionId)` function called from both `onClose` and `onError`, with idempotent behavior. Use a guard (e.g., check `sessionStates.has(sessionId)` before cleanup).

### 16. WebSocket global singleton attached to `window`
- **Severity**: low
- **Description**: The `WsClient` is attached to `window.__bubbleWsClient` to survive code splitting. This is a pragmatic solution but breaks SSR compatibility, makes the dependency invisible to the module system, and pollutes the global namespace.
- **Location**: `apps/web/src/lib/ws-client.ts:154-164`
- **Suggestion**: For a client-only SPA this is acceptable. If SSR is ever considered, extract the singleton into a module-level variable (ES modules are singletons by spec in bundlers like Vite). The `window` attachment is unnecessary for Vite's module system.

### 17. No message schema validation on server
- **Severity**: low
- **Description**: The server parses incoming WebSocket messages as JSON and trusts the TypeScript type assertion (`msg = JSON.parse(raw)` assigned to `ClientMessage`). There is no runtime validation that the message conforms to the expected schema. A malicious client can send arbitrary JSON that passes the type assertion at compile time but has unexpected structure at runtime.
- **Location**: `apps/server/src/ws/handler.ts:109-118`
- **Suggestion**: Add runtime validation using a schema library (e.g., zod, valibot, or a simple manual check). Validate `msg.type` is one of the expected literals and `msg.data` has the required fields before processing. This is especially important since the handler uses `as any` casts that would hide runtime type mismatches.

---

### Summary

| Severity | Count |
|----------|-------|
| Critical | 0     |
| High     | 3     |
| Medium   | 9     |
| Low      | 5     |

**Top priorities:**
1. Fix JWT exposure in WebSocket URL (finding 1) -- security risk in production
2. Server-side authority over `expiresAt` (finding 3) -- prevents abuse
3. Log and handle JWT verification failures (finding 2) -- operational visibility
4. Break circular dependency between rooms/pubsub (finding 6) -- architectural health
5. Replace `KEYS` with `SCAN` for Redis cleanup (finding 8) -- production stability
