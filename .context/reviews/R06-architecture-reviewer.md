# Architecture Review (R06)

Review of: mobile responsiveness, Redis state management, graceful shutdown, Prometheus metrics, deterministic physics sync.

---

## Critical

### Dual-write race condition between in-memory and Redis state

- **Area**: `apps/server/src/ws/rooms.ts` (joinRoom, createBubble, removeBubble)
- **Description**: Every mutation writes to the local in-memory map synchronously and then fires a Redis write asynchronously (fire-and-forget). There is no atomicity between the two stores. During `joinRoom`, the user_joined broadcast and pub/sub publish happen *before* the `await` that fetches room_state from Redis (lines 231-239). This means:
  1. A joining client on Pod A publishes `user_joined` via pub/sub. Pod B receives it and broadcasts to its local clients. But Pod B's Redis read for its own new joiners may not yet see Pod A's member because the `redisAddMember` fire-and-forget may not have completed.
  2. If Redis write fails silently (caught and logged), in-memory state diverges permanently from Redis. No reconciliation mechanism exists to detect or repair this drift.
  3. `expireBubble` (line 373) deletes from the local map and fires `redisRemoveBubble` without awaiting, then broadcasts `bubble_expired` cross-pod. The receiving pod will try to relay the event to clients even though it may still have the bubble in its own local map (it only removes on the local timer, not on the pub/sub message).
- **Impact**: Users on different pods see inconsistent room state. Bubbles may appear to exist on one pod after being expired on another. The `room_state` snapshot sent to new joiners can be stale or incomplete.
- **Recommendation**: (a) Await Redis writes before broadcasting state-changing messages so that subsequent reads are consistent. (b) Add a periodic reconciliation pass that compares local state to Redis and corrects drift. (c) For bubble expiry, the receiving pod should also remove the bubble from its local map when it receives a `bubble_expired` pub/sub relay, rather than relying solely on its own timer.

### Bubble expiry timer is local-only -- no cross-pod expiry coordination

- **Area**: `apps/server/src/ws/rooms.ts` (createBubble, expireBubble)
- **Description**: When a bubble is created, a `setTimeout` is set on the originating pod (line 344). When a different pod receives the `bubble_created` message via pub/sub, it does **not** create a corresponding local timer or local bubble entry. The pub/sub relay in `pubsub.ts` simply forwards the ServerMessage to local WebSocket clients. This means:
  1. Only the originating pod's timer fires `expireBubble`, which broadcasts `bubble_expired`. If that pod crashes or restarts before the timer fires, the bubble is never expired and persists as a ghost in Redis until the 5-minute stale cleanup.
  2. The `getRedisBubbles` function filters by `expiresAt > now` (line 125), so ghost bubbles do eventually stop appearing in room_state snapshots. But there is no active expiry event sent to connected clients on other pods for the ghost window.
- **Impact**: If the originating pod goes down during a rolling deploy, bubbles that were created on that pod will not be actively expired. Clients on surviving pods will not receive `bubble_expired` events for those bubbles.
- **Recommendation**: Each pod should create local expiry timers for bubbles it learns about via pub/sub, or implement a Redis keyspace notification / sorted-set with TTL approach so expiry is infrastructure-driven rather than pod-local.

---

## High

### Graceful shutdown does not drain pub/sub subscriptions before disconnecting Redis

- **Area**: `apps/server/src/index.ts` (shutdown function, lines 67-93)
- **Description**: The shutdown sequence: (1) set readiness to 503, (2) close all WebSocket connections with code 1012, (3) wait 2 seconds, (4) clear intervals, (5) disconnect Redis, (6) disconnect Mongo. Notably, it never calls `leaveRoom` for each connected session. This means:
  1. Redis member entries for all sessions on this pod are never cleaned up during shutdown. They become stale until `cleanupRedisStaleEntries` runs on another pod.
  2. Pub/sub subscriptions are not explicitly unsubscribed; they are torn down implicitly by `disconnectRedis`. Other pods will continue to publish to those channels until they notice the subscriber is gone (which is immediate for Redis pub/sub, so this is low risk).
  3. The `user_left` broadcast for each session is never sent, so clients on other pods see those users as still present until the next `room_state` refresh or until the stale entry cleanup fires.
- **Impact**: During rolling deploys, users on other pods will see phantom "online" users for up to 5 minutes. This is a visible UX degradation during deployments.
- **Recommendation**: Before closing WebSocket connections, iterate `getAllSessions()` and call `leaveRoom` for each to properly clean up Redis entries and broadcast `user_left` messages.

### `ws_connections_active` gauge can go negative on error paths

- **Area**: `apps/server/src/ws/handler.ts` (onClose + onError)
- **Description**: Both `onClose` and `onError` call `decGauge('ws_connections_active')`. If an error occurs and then the connection closes (which is the normal browser behavior -- onerror fires, then onclose fires), the gauge is decremented twice but was only incremented once in `onOpen`. The `sessionStates.delete` check on line 325/342 prevents double `leaveRoom` calls, but the gauge decrement on line 328 happens before the delete, while line 340 checks `if (state)` -- if onError fires first and deletes the state, onClose will skip the decrement. However, if onClose fires first and deletes the state, onError's `if (state)` check prevents the double decrement. The issue is the inverse: if onError fires first (state exists, decrements gauge, deletes state), then onClose fires (state is gone, skips). This path is correct. But if both fire with the state still present (possible in some runtimes where events are synchronous), double decrement occurs.
- **Impact**: Gauge drift over time, causing inaccurate monitoring dashboards. Not critical but erodes trust in metrics.
- **Recommendation**: Use a `Set` to track which sessions have been cleaned up, or add a `cleaned` flag to the session state to ensure idempotent cleanup.

### Health readiness probe does not check Redis or MongoDB connectivity

- **Area**: `apps/server/src/routes/health.ts`
- **Description**: The `/health/ready` endpoint only checks the `shuttingDown` boolean. It does not verify that MongoDB or Redis are actually reachable. A pod could have a broken Redis connection (retry exhausted after 10 attempts) or a stalled MongoDB connection and still report as "ready."
- **Impact**: Kubernetes continues routing traffic to a pod that cannot serve requests properly. Users would experience silent failures on room joins (Redis state missing) or place creation (MongoDB unreachable).
- **Recommendation**: Add lightweight dependency checks (e.g., `redis.ping()`, `mongo.db().admin().ping()`) to the readiness probe, with a short timeout and caching to avoid probe-induced load.

---

## Medium

### `rooms.ts` violates Single Responsibility -- acts as room manager, Redis sync layer, MongoDB updater, and metrics reporter

- **Area**: `apps/server/src/ws/rooms.ts`
- **Description**: This 494-line file handles: (a) in-memory room/client/bubble management, (b) Redis dual-write for members and bubbles, (c) Redis stale entry cleanup with SCAN, (d) MongoDB place activity updates, (e) Prometheus gauge updates, (f) pub/sub orchestration (deciding when to subscribe/unsubscribe). These are at least 4 distinct concerns packed into one module.
- **Impact**: High change risk -- modifying Redis sync logic risks breaking room management. Testing any single concern requires mocking all others. The file will only grow as features are added.
- **Recommendation**: Extract a `RoomRedisSync` service for Redis dual-write operations, move MongoDB place updates to a separate module (or the existing `places` route), and keep `rooms.ts` focused on in-memory room lifecycle only. Use dependency injection (pass sync functions into room operations) to decouple.

### Circular dependency between `rooms.ts` and `pubsub.ts`

- **Area**: `apps/server/src/ws/rooms.ts`, `apps/server/src/ws/pubsub.ts`
- **Description**: `rooms.ts` imports `publishToRoom`, `subscribeRoom`, `unsubscribeRoom` from `pubsub.ts`. `pubsub.ts` imports `broadcastToLocalClients`, `getRoom` from `rooms.ts`. This is a circular dependency. While Node/Bun can resolve it at runtime (the modules are loaded lazily enough that the exports exist by the time they are called), it creates a tight coupling where neither module can be understood or tested in isolation.
- **Impact**: Refactoring either module risks subtle breakage. Makes unit testing significantly harder. Could cause issues if the import order changes or if tree-shaking is applied.
- **Recommendation**: Introduce a message relay abstraction. `pubsub.ts` should emit events (or call a callback) rather than directly importing from `rooms.ts`. Alternatively, have `rooms.ts` register a relay handler with `pubsub.ts` at startup.

### Cursor messages are broadcast cross-pod via Redis pub/sub

- **Area**: `apps/server/src/ws/handler.ts` (line 307), `apps/server/src/ws/rooms.ts` (broadcastToRoom)
- **Description**: `cursor` messages call `broadcastToRoom`, which publishes to Redis pub/sub. At ~10 updates/second per active user, this generates substantial Redis pub/sub traffic. Cursor data is ephemeral and losing a few updates is acceptable.
- **Impact**: Redis pub/sub bandwidth scales as O(users * rooms * pods). In a room with 50 users across 3 pods, that is ~1500 pub/sub messages/second just for cursors.
- **Recommendation**: Either broadcast cursors only to local clients (`broadcastToLocalClients` instead of `broadcastToRoom`), or throttle cross-pod cursor relay to a lower rate (e.g., 2-3 updates/second via batching).

### Metrics middleware records high-cardinality paths

- **Area**: `apps/server/src/metrics.ts` (metricsMiddleware, line 109)
- **Description**: `c.req.routePath || c.req.path` is used as the `path` label. If `routePath` is unavailable (which depends on the Hono version and whether the route matched), `c.req.path` is used, which includes dynamic segments like `/ws/place/abc123`. This creates a unique label per place, causing unbounded label cardinality.
- **Impact**: Prometheus memory usage grows linearly with the number of unique place IDs. Over time this can cause OOM in both the server's metrics map and the Prometheus scraper.
- **Recommendation**: Always use the route pattern (`/ws/place/:placeId`) rather than the resolved path. If `routePath` is unreliable, define a manual path-to-pattern mapping or use Hono's route metadata.

### Redis key extraction uses fragile string replacement

- **Area**: `apps/server/src/ws/rooms.ts` (lines 420-421)
- **Description**: `key.replace('room:', '').replace(':members', '')` extracts the placeId from a Redis key. If a placeId ever contains the substring `room:` or `:members`, this breaks. MongoDB ObjectIds are hex-safe so this is unlikely today, but the pattern is brittle.
- **Impact**: Low probability of actual breakage with current ObjectId placeIds, but the pattern is a maintenance trap.
- **Recommendation**: Use a proper split: `key.split(':')[1]` or, better, store the placeId in the hash value alongside the member data.

---

## Low

### `connectRedis()` is not awaited at startup

- **Area**: `apps/server/src/index.ts` (line 56)
- **Description**: `connectRedis()` is called without `await`. Since `lazyConnect: false` is set in the ioredis config, the connection is initiated but not waited on. `initPubSub()` on the next line sets up the message handler on the `sub` client, but if the connection is not yet established, early pub/sub messages could be missed.
- **Impact**: In practice, the server starts accepting WebSocket connections (via Bun's `fetch` export) immediately. The first few joiners might not have pub/sub relay working yet. Very narrow window.
- **Recommendation**: Either await the Redis connection (with a timeout and fallback to local-only mode), or document this as intentional eventual-consistency.

### Client reconnect on code 1012 bypasses retry count but has no jitter

- **Area**: `apps/web/src/lib/ws-client.ts` (handleReconnect, line 92-98)
- **Description**: On server restart (close code 1012), all clients reconnect after a fixed 500ms delay with no jitter. In a rolling deploy with many connected clients, this creates a thundering herd against the new/remaining pods.
- **Impact**: Temporary spike in connection attempts. For a small-to-medium user base this is fine; at scale it could overwhelm the surviving pods.
- **Recommendation**: Add random jitter (e.g., 200-1500ms) to the 1012 reconnect path.

### No `HELP` descriptions in Prometheus metrics output

- **Area**: `apps/server/src/metrics.ts` (serialize function)
- **Description**: The Prometheus text format output includes `# TYPE` lines but no `# HELP` lines. While not required by the spec, `# HELP` lines are standard practice and improve discoverability in Grafana/Prometheus UI.
- **Impact**: Operational inconvenience only.
- **Recommendation**: Add `# HELP` lines for each metric describing what it measures.

### Deterministic physics uses global mutable noise state

- **Area**: `apps/web/src/physics/bubblePhysics.ts` (lines 24-44)
- **Description**: `_noiseSeed` and `_noise3D` are module-level mutable singletons. `initNoise` is called when room_state is received. If a user switches rooms quickly, the noise seed changes globally, which could briefly cause incorrect physics for bubbles from the previous room that are still animating out.
- **Impact**: Purely visual glitch during room transitions, very minor.
- **Recommendation**: Consider making the noise function part of a per-room or per-scene context rather than a global singleton.
