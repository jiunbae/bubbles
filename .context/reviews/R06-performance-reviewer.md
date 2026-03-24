# Performance Review (R06)

**Scope:** Last 10 commits covering Redis state management, WebSocket pub/sub, Prometheus metrics, physics sync, mobile responsiveness.

**Note on R05 findings:** The R05 review identified 13 issues. Of those, #9 (Redis KEYS command) was addressed -- `redisScanKeys` now uses `SCAN` with cursor. Finding #12 (console.log on every WS message) was partially addressed -- `ping` and `cursor` are excluded. Most other R05 findings (InstancedMesh, single useFrame loop, PRNG per frame) remain open. This review focuses on new and evolved concerns.

---

## Critical

### 1. Redis cleanup iterates all hashes sequentially with no pipelining
- **Area**: Redis / Server
- **File**: `apps/server/src/ws/rooms.ts:408-443`
- **Impact**: `cleanupRedisStaleEntries()` runs every 5 minutes. It SCANs for all `room:*:members` keys, then for each key calls `HGETALL`, then for each stale entry calls `HDEL` -- all as individual round-trips. With 100 rooms and 10 stale entries each, this is 100 HGETALL + up to 1000 HDEL calls, each a separate TCP round-trip. At typical Redis RTT of 0.5ms, that is 500ms+ of blocking the event loop (since every `await` yields but the function runs sequentially).
- **Measurement**: Add timing around `cleanupRedisStaleEntries` and log duration. Count total HDEL calls per cleanup cycle.
- **Recommendation**: Use Redis pipelines. Batch all HDEL calls for a single key into one pipeline call. At minimum: `const pipeline = redis.pipeline(); ... pipeline.hdel(key, ...staleIds); await pipeline.exec();`. Also consider setting a TTL on the hash keys themselves so Redis auto-evicts, eliminating the need for most cleanup logic.

### 2. Double JSON.stringify on every broadcast message (local + pub/sub)
- **Area**: WebSocket / Server
- **Files**: `apps/server/src/ws/rooms.ts:288`, `apps/server/src/ws/pubsub.ts:86-92`
- **Impact**: Every `broadcastToRoom` call triggers: (1) `JSON.stringify(message)` in `broadcastToLocalClients` (line 288), then (2) `JSON.stringify(payload)` in `publishToRoom` where `payload` wraps the same `message` (line 92). The message is serialized twice -- once standalone, once wrapped in a `PubSubMessage` envelope. For bubble_created messages (~400 bytes), this doubles serialization CPU per broadcast.
- **Measurement**: Profile `broadcastToRoom` with `performance.now()` under load with 20+ users per room.
- **Recommendation**: Pre-serialize the message once and pass the string to both `broadcastToLocalClients` (which can send it directly) and `publishToRoom` (which wraps the pre-serialized string). Change `PubSubMessage.message` to `rawMessage: string` so the pub/sub envelope serialization only wraps a string, not a re-serialized object.

---

## High

### 3. Per-bubble material clone unchanged from R05 -- 80 draw calls
- **Area**: Rendering / Client
- **File**: `apps/web/src/components/visual/BubbleMesh.tsx:51-57`
- **Impact**: Each bubble still clones `MeshStandardMaterial`, producing 80 separate GPU uniform sets and 80 draw calls. Combined with up to 5 point lights in the Alley theme, this means 80 x 5 = 400 light passes. On mobile GPUs (Adreno 6xx, Mali-G78), this is the primary bottleneck for frame rate.
- **Measurement**: Open Chrome DevTools > Performance tab > record a session with 50+ bubbles. Check draw call count via `renderer.info.render.calls`. Target: < 5 draw calls for all bubbles.
- **Recommendation**: Migrate to `InstancedMesh` with per-instance color via `InstancedBufferAttribute`. This collapses all bubbles to 1 draw call.

### 4. `Date.now()` called twice per frame per bubble
- **Area**: Physics / Client
- **File**: `apps/web/src/components/visual/BubbleMesh.tsx:82,88`
- **Impact**: Lines 82 and 88 each call `Date.now()`. With 80 bubbles at 60fps, that is 9,600 `Date.now()` calls/second. While `Date.now()` is fast (~10ns on V8), the real cost is that each bubble has its own `useFrame` callback, and the timestamp should be shared. More critically, the two `Date.now()` calls within the same frame can return different millisecond values, causing subtle inconsistency between the physics time (line 82) and the expiry check (line 88).
- **Measurement**: Replace both calls with `state.clock.getElapsedTime()` (available from the `_state` parameter in useFrame) and measure frame time reduction.
- **Recommendation**: Use a single timestamp per frame. The R3F `state.clock` is already available. Alternatively, consolidate all bubble updates into a single `useFrame` loop (as recommended in R05) and call `Date.now()` once.

### 5. Redis operations on every join are not pipelined
- **Area**: Redis / Server
- **File**: `apps/server/src/ws/rooms.ts:214-249`
- **Impact**: `joinRoom` performs: `redisAddMember` (HSET), potentially `subscribeRoom` (SUBSCRIBE), then `Promise.all([getRedisMembers (HGETALL), getRedisBubbles (HGETALL), getPlaceName (MongoDB findOne)])`. The initial HSET is fire-and-forget but still consumes a connection slot. The two HGETALL calls run in parallel (good), but `redisAddMember` could race with `getRedisMembers` -- the joining user might not appear in their own room_state if HSET hasn't completed.
- **Measurement**: Log whether the joining user appears in the room_state users list. Under Redis latency, this race becomes visible.
- **Recommendation**: Await `redisAddMember` before fetching `getRedisMembers`, or pipeline HSET + HGETALL into a single Redis transaction using `MULTI/EXEC`.

### 6. `updateRoomGauges` iterates all rooms on every join/leave/bubble event
- **Area**: Metrics / Server
- **File**: `apps/server/src/ws/rooms.ts:470-480`
- **Impact**: `updateRoomGauges()` is called on every `joinRoom`, `leaveRoom`, `createBubble`, `removeBubble`, and `expireBubble`. It iterates over ALL rooms to sum users and bubbles. With 100 active rooms and frequent bubble events (each room can blow every 250ms), this runs hundreds of times per second, each time scanning 100 rooms.
- **Measurement**: Count invocations per second under load. With 20 rooms and 10 users each blowing, expect ~800 calls/sec.
- **Recommendation**: Maintain running counters (`totalUsers`, `totalBubbles`) that increment/decrement on individual events instead of recomputing from scratch. Call `setGauge` with the cached values.

---

## Medium

### 7. Histogram bucket cumulative sum recomputed on every /metrics scrape
- **Area**: Metrics / Server
- **File**: `apps/server/src/metrics.ts:89`
- **Impact**: The `serialize()` function computes cumulative bucket sums via `entry.buckets.slice(0, i + 1).reduce(...)` for every bucket at every label combination. This is O(B^2) per histogram series where B = 11 buckets. With high-cardinality labels (method x path x status), the serialization cost grows quadratically. The `.slice()` also allocates a new array per bucket.
- **Measurement**: Profile `/metrics` endpoint response time with 50+ unique path/status combinations.
- **Recommendation**: Store cumulative counts directly in the bucket array (increment all buckets >= value in `observeHistogram`), eliminating the need for `.slice().reduce()` at serialization time. This changes `observeHistogram` from O(B) to O(B) (same) but changes serialization from O(B^2) to O(B).

### 8. `labelsToKey` sorts entries on every metric observation
- **Area**: Metrics / Server
- **File**: `apps/server/src/metrics.ts:18-21`
- **Impact**: `labelsToKey` is called on every counter increment, histogram observation, and gauge set. It calls `Object.entries()`, `.sort()`, and `.map().join()` each time. For the HTTP middleware (every request), this runs twice (counter + histogram) with 3 labels each. The sort is O(k log k) per call.
- **Measurement**: Benchmark `labelsToKey` isolated -- expect ~500ns per call. At 1000 req/s, that is ~1ms/s total (negligible alone, but adds up).
- **Recommendation**: For the common case of the HTTP middleware where labels are always `{method, path, status}`, pre-build the key string inline: `` `method="${method}",path="${path}",status="${status}"` ``. Or cache the label key computation with a WeakMap or pre-sorted template.

### 9. Pub/sub message envelope includes redundant data
- **Area**: Network / Server
- **File**: `apps/server/src/ws/pubsub.ts:10-14,86-92`
- **Impact**: Every pub/sub message wraps the full `ServerMessage` inside a `PubSubMessage` envelope that adds `originPodId` and `originSessionId`. The `ServerMessage` already contains data like `sessionId` in most message types. For `cursor_moved` messages (the highest-frequency type), the envelope overhead (~60 bytes of JSON keys/quotes for originPodId and originSessionId) is ~30% of the total payload.
- **Measurement**: Log average pub/sub message size. Compare with and without envelope optimization.
- **Recommendation**: For cross-pod filtering, encode `originPodId` as a compact prefix (e.g., `POD_ID|sessionId|rawJSON`) instead of wrapping in a JSON envelope. This avoids double-serialization and reduces overhead.

### 10. `room_state` message size grows linearly with room population
- **Area**: Network / Server
- **File**: `apps/server/src/ws/rooms.ts:241-246`
- **Impact**: The `room_state` message includes the full `users[]` array and `bubbles[]` array. Each `UserInfo` is ~100 bytes JSON, each `BubbleInfo` is ~250 bytes. With 50 users and 80 bubbles, the room_state message is ~25KB. This is sent to every joining client. If many clients join simultaneously (e.g., after a server restart with code 1012), all clients reconnect and each receives a 25KB room_state.
- **Measurement**: Log `room_state` message byte size. Alert if > 50KB.
- **Recommendation**: For large rooms, consider pagination or delta-sync. Send a compact initial state and stream updates. For the current scale (MAX_BUBBLES=80), this is acceptable but worth monitoring.

### 11. `seededRandom` PRNG instantiation per frame per bubble in `shouldNaturallyPop`
- **Area**: Physics / Client
- **File**: `apps/web/src/physics/bubblePhysics.ts:259-261`
- **Impact**: Unchanged from R05. After 70% lifetime, each bubble creates a new `seededRandom` closure every frame. With 80 bubbles past 70% lifetime at 60fps = 4,800 closure allocations/second. The closure creation involves `Math.imul` arithmetic which is fast, but the allocation pressure triggers more frequent minor GC pauses.
- **Measurement**: Chrome DevTools > Performance > check GC frequency during heavy bubble count.
- **Recommendation**: Pre-compute a pop schedule at bubble creation or cache the PRNG per bubble in `BubblePhysicsState`.

---

## Low

### 12. Redis connection not awaited before pub/sub initialization
- **Area**: Startup / Server
- **File**: `apps/server/src/index.ts:56-57`
- **Impact**: `connectRedis()` sets `lazyConnect: false`, so ioredis begins connecting immediately but does not await the connection promise. `initPubSub()` is called on the next line, which calls `getSub()` and attaches the `message` handler. If the sub connection is not yet established, the handler attachment succeeds (it's just an EventEmitter `on`), but any `subscribe()` calls issued before the connection is ready will be queued by ioredis. This is safe but means the first few join events may not subscribe to pub/sub channels, causing missed cross-pod messages during startup.
- **Measurement**: Add a `ready` event listener on the sub connection and log the delta between `connectRedis()` and ready.
- **Recommendation**: Await the Redis `ready` event before calling `initPubSub()` and starting the HTTP server. This ensures pub/sub is fully operational before accepting connections.

### 13. Graceful shutdown drain timeout is fixed at 2 seconds
- **Area**: Shutdown / Server
- **File**: `apps/server/src/index.ts:86`
- **Impact**: The shutdown sequence closes all WebSocket connections with code 1012, then waits exactly 2 seconds for close frames to flush before disconnecting Redis and exiting. If there are many connections or network latency is high, 2 seconds may not be enough. Conversely, for a server with 0 connections, it wastes 2 seconds on every deploy.
- **Measurement**: Log the number of connections at shutdown and measure actual drain time.
- **Recommendation**: Make the drain timeout configurable or adaptive. Wait until all connections are confirmed closed (with a max timeout). Use `Promise.allSettled` on close acknowledgments.

### 14. Three.js `IcosahedronGeometry` detail level 3 may be excessive for mobile
- **Area**: Rendering / Client
- **File**: `apps/web/src/components/visual/BubbleScene.tsx:44`
- **Impact**: `IcosahedronGeometry(1, 3)` produces 642 vertices and 1280 triangles per bubble. At 80 bubbles, that is 102,400 triangles for bubbles alone. While the geometry is shared, each draw call still processes the full vertex buffer. On mobile GPUs with limited vertex throughput, this contributes to frame drops.
- **Measurement**: Compare frame rates with detail level 2 (162 vertices, 320 triangles) vs level 3.
- **Recommendation**: Use detail level 2 for mobile devices (detected via `navigator.maxTouchPoints > 0` or `renderer.capabilities`). Bubbles are translucent and small -- the visual difference between level 2 and 3 is negligible.

### 15. `lastCursorSent` map has no periodic cleanup for abandoned entries
- **Area**: Memory / Server
- **File**: `apps/server/src/ws/handler.ts:27`
- **Impact**: The `lastCursorSent` map stores `${placeId}:${sessionId}` keys. Entries are deleted on `onClose` and `onError`, but if neither fires (e.g., TCP connection drops without close frame), entries accumulate. Each entry is small (~50 bytes), so this only matters at very high connection churn over long server uptime.
- **Measurement**: Log `lastCursorSent.size` periodically. Compare with `sessionStates.size` -- they should be equal or `lastCursorSent` should be smaller.
- **Recommendation**: Tie cursor entries to `sessionStates` lifecycle, or add a sweep in `cleanupStaleRooms`.

---

## Summary

**Highest-impact items to address:**
1. **Pipeline Redis cleanup operations** (Finding 1) -- reduces cleanup latency from O(N) round-trips to O(1)
2. **Eliminate double JSON.stringify on broadcast** (Finding 2) -- halves serialization CPU on the hot path
3. **InstancedMesh for bubbles** (Finding 3, carried from R05) -- reduces draw calls from 80 to 1, critical for mobile
4. **Single useFrame loop** (Finding 4, carried from R05) -- eliminates 80 callback dispatches per frame
5. **Incremental gauge updates** (Finding 6) -- removes O(rooms) scan on every bubble event

**Items addressed since R05:**
- Redis KEYS -> SCAN (R05 #9): Fixed in `redisScanKeys` using cursor-based SCAN
- Console.log filtering (R05 #12): Partially fixed -- ping and cursor excluded
- Bubble seed/expiresAt sync (R04 findings): Fixed -- client now sends seed and expiresAt
