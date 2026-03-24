# Code Review Summary (R06)

**Date**: 2026-03-24
**Reviewers**: Security, Architecture, Code Quality, Performance
**Scope**: Last 10 commits — Redis state, graceful shutdown, Prometheus metrics, mobile responsiveness, physics sync

---

## Critical Findings (must fix)

### 1. `/metrics` endpoint publicly accessible without authentication
- **Agents**: Security
- **File**: `apps/server/src/index.ts:24`
- **Impact**: Leaks internal counters (user counts, room activity, routes, response times)
- **Fix**: Serve metrics on a separate internal port, or add IP/token auth

### 2. Dual-write race: Redis fire-and-forget causes cross-pod state inconsistency
- **Agents**: Architecture, Performance
- **File**: `apps/server/src/ws/rooms.ts` (joinRoom, createBubble, expireBubble)
- **Impact**: Users on different pods see inconsistent room state; joining user may not appear in own room_state
- **Fix**: Await `redisAddMember` before fetching room_state; use pipeline for HSET+HGETALL

### 3. Bubble expiry timer is local-only — no cross-pod coordination
- **Agents**: Architecture
- **File**: `apps/server/src/ws/rooms.ts` (createBubble, expireBubble)
- **Impact**: If originating pod dies during rolling deploy, bubbles become ghosts (no expiry event sent)
- **Fix**: Receiving pods should also track expiry, or use Redis TTL + keyspace notifications

### 4. Redis cleanup lacks pipelining (sequential HDEL round-trips)
- **Agents**: Performance
- **File**: `apps/server/src/ws/rooms.ts:408-443`
- **Impact**: 100 rooms × 10 stale entries = 1000+ round-trips, blocking event loop
- **Fix**: Use `redis.pipeline()` to batch HDEL calls

### 5. Double JSON.stringify on every broadcast (local + pub/sub)
- **Agents**: Performance
- **File**: `rooms.ts:288`, `pubsub.ts:86-92`
- **Impact**: Doubles serialization CPU on every WebSocket message
- **Fix**: Pre-serialize once; pass raw string to both local broadcast and pub/sub publish

---

## High Priority

### 6. Graceful shutdown doesn't call `leaveRoom` — phantom users persist in Redis
- **Agents**: Architecture
- **Fix**: Iterate `getAllSessions()` and call `leaveRoom` for each before closing WS

### 7. No `placeId` validation on WebSocket path — memory/Redis exhaustion
- **Agents**: Security
- **Fix**: Validate as 24-char hex ObjectId before WS upgrade; verify place exists in MongoDB

### 8. No WebSocket message size limit — DoS via large payloads
- **Agents**: Security
- **Fix**: Reject messages > 4KB before JSON.parse

### 9. `ws_connections_active` gauge double-decrement on error+close
- **Agents**: Architecture, Code Quality
- **Fix**: Guard `onError` with `sessionStates.has(sessionId)` check; move all cleanup to `onClose`

### 10. Readiness probe doesn't check Redis/MongoDB connectivity
- **Agents**: Architecture
- **Fix**: Add `redis.ping()` and `mongo.ping()` to `/health/ready`

### 11. Weak default secrets in docker-compose.yml (`changeme`)
- **Agents**: Security
- **Fix**: Remove `:-changeme` defaults

### 12. `updateRoomGauges` iterates ALL rooms on every bubble event
- **Agents**: Performance
- **Fix**: Maintain incremental counters instead of full recomputation

### 13. Per-bubble material clone = 80 draw calls (mobile bottleneck)
- **Agents**: Performance (carried from R05)
- **Fix**: Migrate to `InstancedMesh` with per-instance color

---

## Medium Priority

### 14. Redis key/channel injection via unsanitized placeId
- **Agents**: Security
- **Fix**: Validate placeId as strict 24-char hex

### 15. Cursor messages broadcast cross-pod via Redis pub/sub (high frequency)
- **Agents**: Architecture
- **Fix**: Use `broadcastToLocalClients` for cursors, not `broadcastToRoom`

### 16. Metrics middleware records high-cardinality paths
- **Agents**: Architecture
- **Fix**: Always use route pattern, not resolved path

### 17. `ModeSwitch` useEffect missing dependency array
- **Agents**: Code Quality
- **Fix**: Add `[mode, setMode]` dependency array

### 18. Duplicate keyboard handler for Ctrl+Shift+M
- **Agents**: Code Quality
- **Fix**: Remove from `StealthMode.tsx`; `ModeSwitch` handles it globally

### 19. Duplicate bubble-creation logic in BubbleControls + BubbleScene
- **Agents**: Code Quality
- **Fix**: Extract shared `spawnBubble()` utility

### 20. `BubbleControls` reads `window.innerWidth` non-reactively
- **Agents**: Code Quality
- **Fix**: Use a `useMediaQuery` hook or Tailwind classes

### 21. Per-pod rate limiter ineffective in multi-pod deployment
- **Agents**: Security
- **Fix**: Consider Redis-backed sliding window for production

### 22. Circular dependency between `rooms.ts` and `pubsub.ts`
- **Agents**: Architecture
- **Fix**: Introduce callback/event-based relay pattern

### 23. Fragile Redis key parsing via string replacement
- **Agents**: Architecture, Code Quality
- **Fix**: Use regex: `key.match(/^room:(.+):members$/)?.[1]`

---

## Low Priority / Suggestions

| # | Finding | Agent(s) |
|---|---------|----------|
| 24 | Redis connection not awaited at startup | Architecture, Performance |
| 25 | No jitter on 1012 reconnect (thundering herd) | Architecture |
| 26 | Missing `# HELP` in Prometheus output | Architecture |
| 27 | `StealthMode.tsx` 296-line component | Code Quality |
| 28 | Inline SVG duplication across components | Code Quality |
| 29 | No test files in entire project | Code Quality |
| 30 | `process.exit(0)` without awaiting HTTP drain | Code Quality |
| 31 | Fixed 2s shutdown drain timeout | Performance |
| 32 | IcosahedronGeometry detail 3 excessive for mobile | Performance |
| 33 | `lastCursorSent` lacks periodic cleanup | Security, Performance |
| 34 | Duplicate Redis connection options | Code Quality |
| 35 | Hardcoded `SIZE_RADIUS['M']` in physics | Code Quality |
| 36 | Health endpoint exposes uptime | Security |

---

## Agreements (multiple agents flagged)

| Finding | Agents |
|---------|--------|
| Dual-write race / Redis join race | Architecture + Performance |
| `ws_connections_active` double decrement | Architecture + Code Quality |
| Fragile Redis key parsing | Architecture + Code Quality |
| Redis connection not awaited | Architecture + Performance |
| `lastCursorSent` cleanup | Security + Code Quality + Performance |

---

## Statistics

| Metric | Count |
|--------|-------|
| **Total findings** | 36 |
| **Critical** | 5 |
| **High** | 8 |
| **Medium** | 10 |
| **Low** | 13 |
| By agent: Security | 16 |
| By agent: Architecture | 13 |
| By agent: Code Quality | 22 |
| By agent: Performance | 15 |
| Multi-agent agreements | 5 |
