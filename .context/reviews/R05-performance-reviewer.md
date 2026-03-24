## Performance Review (R05)

### 1. Material Clone per Bubble Creates Excessive GPU Objects
- **Severity**: high
- **Description**: Every `BubbleMesh` calls `sharedMaterial.clone()` inside a `useMemo`, creating a unique `MeshStandardMaterial` per bubble. While the comment says "it reuses the compiled shader program," each clone is still a distinct WebGL uniform set and a separate draw call because Three.js cannot batch meshes with different material instances. With 80 bubbles, this means 80 draw calls minimum. Additionally, `material.opacity` is mutated every frame in `useFrame` (line 127), which triggers material `needsUpdate` implicitly, preventing any potential future batching.
- **Location**: `apps/web/src/components/visual/BubbleMesh.tsx:51-57`
- **Suggestion**: Use `InstancedMesh` with a single material. Store per-instance color in an `InstancedBufferAttribute` and pass opacity via a custom shader uniform or vertex attribute. This collapses 80 draw calls to 1 and eliminates 80 material clones. If instancing is too large a refactor, at minimum use `mesh.material.color.set()` on the shared material and accept uniform color, or use a custom `ShaderMaterial` with per-instance attributes.

### 2. Raycaster Allocated Every Spawn Tick
- **Severity**: medium
- **Description**: `BubbleSpawner.spawnBatch()` creates `new THREE.Raycaster()` on every call (line 101). During hold-to-spawn, this fires every 250ms, allocating a new raycaster plus cloned vectors each time. The `dir.clone()`, `rc.ray.origin.clone()`, and `addScaledVector` also create throwaway Vector3 objects.
- **Location**: `apps/web/src/components/visual/BubbleScene.tsx:101-106`
- **Suggestion**: Hoist the `Raycaster` and temporary `Vector3` objects to module-level or `useRef` constants. Reuse them by calling `.set()` / `.copy()` instead of allocating new instances.

### 3. useFrame Runs per Bubble (N Callbacks per Frame)
- **Severity**: high
- **Description**: Each `BubbleMesh` registers its own `useFrame` callback. With 80 bubbles, React Three Fiber must invoke 80 separate callbacks per animation frame. Each callback also calls `Date.now()` twice (lines 79, 85), performs physics via `updateBubble` (simplex noise + sqrt + trig), and sets mesh properties. The overhead of 80 individual R3F callback dispatches plus 80 simplex noise evaluations (3 calls each in `updateBubble`) is significant.
- **Location**: `apps/web/src/components/visual/BubbleMesh.tsx:75-128`
- **Suggestion**: Move to a single `useFrame` loop in `BubbleRenderer` that iterates over all bubbles, updating positions on an `InstancedMesh` instance matrix. This eliminates per-component callback overhead and enables a tight loop with better CPU cache behavior. At minimum, cache `Date.now()` once per frame outside the per-bubble loop.

### 4. `shouldNaturallyPop` Creates a New PRNG Every Frame per Bubble
- **Severity**: medium
- **Description**: After 70% lifetime, `shouldNaturallyPop` is called every frame for every bubble. Each call creates a new `seededRandom` PRNG (line 260). With 80 bubbles at 60fps, that is up to 4800 PRNG instantiations per second. The function is designed for determinism, but the cost of constructing a closure each frame is unnecessary.
- **Location**: `apps/web/src/physics/bubblePhysics.ts:248-266`
- **Suggestion**: Pre-compute the pop probability table at bubble creation and store it in `BubblePhysicsState`, or cache the PRNG instance per bubble instead of recreating from seed each frame.

### 5. PopEffect Uses `useState` for Particle Events Causing React Re-renders
- **Severity**: medium
- **Description**: `usePopEffect` stores pop events in `useState<PopEvent[]>` (line 68). Every `triggerPop` call triggers `setPops(prev => [...prev, ...])`, which causes a React re-render of `BubbleRenderer` and all its children. When multiple bubbles pop in quick succession (e.g., room_state replaces all bubbles), this can cause a cascade of re-renders. The `setPops` filter in `useFrame` (line 199) also triggers re-renders.
- **Location**: `apps/web/src/components/visual/PopEffect.tsx:67-113`
- **Suggestion**: Use a `useRef` for the pop events array instead of `useState`. Since `PopEffectRenderer` reads pops in `useFrame` (imperative, not declarative), React state is not needed. Mutate the ref directly to avoid re-renders entirely.

### 6. Bubble Store Creates New Map on Every Mutation
- **Severity**: low
- **Description**: Every `addBubble`, `removeBubble`, `popBubble` call creates `new Map(state.bubbles)` to maintain immutability. With frequent WebSocket messages (other users blowing/popping), this copies the entire bubble map. At 80 bubbles, each copy is ~80 entries. Combined with `useMemo(() => Array.from(bubbles.values()), [bubbles])` in `BubbleRenderer` (line 222), every single bubble mutation creates a new Map AND a new array.
- **Location**: `apps/web/src/stores/bubble-store.ts:29-31`, `apps/web/src/components/visual/BubbleScene.tsx:222`
- **Suggestion**: This is acceptable for 80 items but worth noting. If bubble count grows, consider using Immer or a mutable ref-based store for the hot path, with selective subscriptions.

### 7. Duplicate Expiry Timers: BubbleScene vs WebSocketProvider
- **Severity**: medium
- **Description**: When a remote bubble arrives via WebSocket, `WebSocketProvider` sets a `setTimeout` to remove it (line 54), AND the bubble's `BubbleMesh` also runs its own expiry check in `useFrame` (lines 85-89) which triggers `onExpire`. Both paths call `removeBubble`. The `scheduleExpiry` in `BubbleScene` is only used for locally-created bubbles, but the `useFrame` expiry check runs on ALL bubbles. This means remote bubbles may get double-removal attempts, and the `setTimeout` in `WebSocketProvider` is never cleaned up if the bubble is popped early.
- **Location**: `apps/web/src/providers/WebSocketProvider.tsx:52-55`, `apps/web/src/components/visual/BubbleMesh.tsx:85-89`
- **Suggestion**: Unify expiry handling. Either use `scheduleExpiry`/`cancelExpiry` for all bubbles (local and remote) or rely solely on the `useFrame` check. The current `setTimeout` in `WebSocketProvider` leaks if the bubble is popped before expiry.

### 8. `lastCursorSent` Map in Handler Never Cleaned Up on Disconnect for Other Rooms
- **Severity**: low
- **Description**: The `lastCursorSent` Map (handler.ts:27) stores `${placeId}:${sessionId}` keys. On disconnect, only the current session's entry is deleted (line 299). However, if cursor messages are malformed or the key format changes, stale entries could accumulate. More importantly, the `sessionStates` Map holds references to the `WSContext` and `BubblesUser` objects, which keeps them in memory. If `onClose` never fires (network anomaly), these leak.
- **Location**: `apps/server/src/ws/handler.ts:27-28`, `apps/server/src/ws/handler.ts:291-300`
- **Suggestion**: Add a periodic sweep of `sessionStates` that checks `lastPingAt` against a timeout (e.g., 60s). The ping interval is 20s, so any session not pinged in 60s is likely dead.

### 9. Redis `KEYS` Command in Cleanup is O(N) and Blocks
- **Severity**: high
- **Description**: `cleanupRedisStaleEntries()` uses `redis.keys('room:*:members')` and `redis.keys('room:*:bubbles')` (lines 402, 419). The `KEYS` command scans the entire keyspace and blocks Redis during execution. In production with many rooms, this causes latency spikes for all Redis operations.
- **Location**: `apps/server/src/ws/rooms.ts:402-429`
- **Suggestion**: Use `SCAN` with a cursor instead of `KEYS`. Alternatively, maintain a Redis Set of active room IDs and iterate over that, which is O(1) per lookup instead of O(N) full scan.

### 10. pointLight Count Across Themes
- **Severity**: medium
- **Description**: The Alley theme uses 3 `pointLight` components (lines 126-128) plus each `Streetlamp` adds 1 more. Park theme has 2 streetlamps (2 point lights). Point lights are expensive in Three.js as each one requires an additional lighting pass per mesh. With 80 bubble meshes (each a separate draw call due to material clones), the cost multiplies: roughly `num_lights * num_draw_calls` fragment shader executions.
- **Location**: `apps/web/src/components/visual/SkyEnvironment.tsx:126-128, 45`
- **Suggestion**: If using the per-bubble material clone approach, limit point lights to 2 max. Better yet, bake streetlamp lighting into emissive materials or use a single ambient + directional setup. Switching to `InstancedMesh` would also reduce the light cost since all bubbles become 1 draw call.

### 11. `popBubble` Uses Spawn Position, Not Current Position
- **Severity**: low
- **Description**: When a remote bubble is popped via WebSocket, `popBubble` in the store queues a `PendingPop` using `bubble.x, bubble.y, bubble.z` (the original spawn position from `BubbleInfo`). But bubbles drift via physics, so the pop effect appears at the wrong location. This is not strictly a performance issue but causes visual artifacts that may seem like a rendering bug.
- **Location**: `apps/web/src/stores/bubble-store.ts:52-57`
- **Suggestion**: Track current physics position in a separate mutable map (e.g., `Map<string, [number,number,number]>`) updated each frame, and use that for remote pop effect positioning.

### 12. `console.log` on Every WebSocket Message
- **Severity**: medium
- **Description**: Line 121 in handler.ts logs every incoming message: `console.log(\`[ws] Message from ${user.displayName}: ${msg.type}\`)`. With cursor messages throttled at 100ms and multiple users, this generates significant I/O. Even ping messages (every 20s per user) are logged.
- **Location**: `apps/server/src/ws/handler.ts:121`
- **Suggestion**: Remove or gate behind a `DEBUG` flag. At minimum, exclude `ping` and `cursor` message types from logging.

### 13. No WebSocket Message Batching or Compression
- **Severity**: low
- **Description**: Each bubble blow sends an individual WebSocket message immediately. During hold-to-spawn (every 250ms), each bubble is a separate `send()` call. The server also broadcasts each bubble_created individually. With multiple users spawning simultaneously, message frequency scales linearly.
- **Location**: `apps/web/src/components/visual/BubbleScene.tsx:122-127`, `apps/server/src/ws/handler.ts:187`
- **Suggestion**: Consider batching: accumulate blow messages over a short window (e.g., 50ms) and send as a single array. On the server side, batch broadcasts to reduce per-message overhead. For the current scale this is acceptable, but it becomes important with more concurrent users.

### Summary

The most impactful issues are:
1. **80 material clones = 80 draw calls** (Finding 1) -- switch to `InstancedMesh`
2. **80 useFrame callbacks per frame** (Finding 3) -- consolidate into one loop
3. **Redis KEYS command** (Finding 9) -- replace with SCAN
4. **Console.log on every WS message** (Finding 12) -- gate behind debug flag
