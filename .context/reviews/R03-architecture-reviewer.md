# R03 Architecture Review -- Principal Architect

**Date:** 2026-03-23
**Scope:** Full codebase review of all source files across `apps/web`, `apps/server`, and `packages/shared`
**Reviewer role:** Principal Architect

---

## Executive Summary

The Bubbles codebase is well-structured with clean separation between shared types, server, and client. The WebSocket real-time flow is architecturally sound but has several correctness and reliability issues. The most critical problem is a **broken API proxy configuration** that would prevent all REST API calls from working. Beyond that, there are duplicate code blocks, uncleared timers, a memory leak in the cursor throttle map, and missing reconnection UX for users. Stealth mode is functional but does not send WS messages for its bubble operations.

**Issue count:** 22 issues (5 Critical, 7 High, 7 Medium, 3 Low)

---

## 1. Real-time Sync Correctness

### CRITICAL: API proxy does not strip `/api` prefix -- all REST calls 404
**Severity:** Critical
**Location:** `apps/web/vite.config.ts:16-19` and `apps/web/src/lib/api.ts:12`

The client sets `API_BASE = '/api'` and makes requests to `/api/places`, `/api/places/:id`, etc. The Vite dev proxy forwards `/api` requests to `http://localhost:3001` but does **not** include a `rewrite` function to strip the `/api` prefix. The server routes are mounted at `/places`, `/health`, `/logs` -- no `/api` prefix exists on the server.

Result: every REST API call (`fetchPlaces`, `createPlace`, `getPlace`, `getPlaceLogs`) receives a 404 in development.

**Fix:**
```ts
// vite.config.ts
'/api': {
  target: 'http://localhost:3001',
  changeOrigin: true,
  rewrite: (path) => path.replace(/^\/api/, ''),
},
```

### HIGH: Client-side setTimeout for remote bubble expiry is not cleared on early pop
**Severity:** High
**Location:** `apps/web/src/providers/WebSocketProvider.tsx:51-53`

When a `bubble_created` message arrives from another user, a `setTimeout` is set to auto-remove it at `expiresAt`. If the bubble is popped before that (via `bubble_popped` message), the timer still fires, calling `removeBubble` on an already-removed ID. While this is a no-op functionally (Map delete on missing key), it:
1. Accumulates orphaned timer handles proportional to bubble count
2. Could cause subtle timing issues if IDs were ever reused

**Fix:** Track timer IDs in a `Map<string, number>` and clear them in `bubble_popped` / `bubble_expired` handlers.

### HIGH: No retry count reset on successful reconnection
**Severity:** High
**Location:** `apps/web/src/lib/ws-client.ts:51-54`

On successful `onopen`, the code resets `reconnectDelay` to 1000 but never resets `retryCount` to 0. After 3 disconnects+reconnects across the entire session, the client permanently stops reconnecting (`maxRetries = 3`). A user who has a flaky connection will be permanently disconnected after the third reconnect cycle.

**Fix:**
```ts
ws.onopen = () => {
  this.reconnectDelay = 1000;
  this.retryCount = 0;  // <-- add this
  this.onConnectionChange?.('connected');
  this.startPingInterval();
};
```

### HIGH: Race condition in room_state delivery -- async getPlaceName
**Severity:** High
**Location:** `apps/server/src/ws/rooms.ts:113-120`

`joinRoom` calls `getPlaceName(placeId).then(...)` to send `room_state` asynchronously. Between the `.then()` scheduling and the actual send:
1. Another user could blow a bubble, which gets broadcast to the joining client before it receives `room_state`
2. The client would add that bubble via `bubble_created`, then `room_state` arrives and calls `setBubbles()` which overwrites the store -- potentially losing the bubble just added

**Fix:** Either send `room_state` synchronously (cache place names in the room object) or add a `joined` flag on the client that buffers messages until `room_state` is received.

### MEDIUM: `bubble_expired` broadcast does not clear the timer reference
**Severity:** Medium
**Location:** `apps/server/src/ws/rooms.ts:221-236`

`expireBubble` deletes the bubble from the Map but does not call `clearTimeout(bubble.timer)`. Since the timer has already fired (this function runs inside the timer callback), it's technically harmless, but the timer reference is retained until GC collects the Map entry. More importantly, there's no guard against `expireBubble` being called concurrently with `removeBubble` (pop). If a user pops a bubble at the exact moment the timer fires, both `removeBubble` and `expireBubble` run. `removeBubble` clears the timer and deletes, then `expireBubble` tries to delete again and broadcasts `bubble_expired` for an already-popped bubble.

**Fix:** In `expireBubble`, check if the bubble still exists before broadcasting:
```ts
function expireBubble(placeId: string, bubbleId: string): void {
  const removed = removeBubble(placeId, bubbleId);
  if (!removed) return; // already popped
  broadcastToRoom(placeId, { type: 'bubble_expired', ts: Date.now(), data: { bubbleId } });
}
```

### MEDIUM: Stealth mode `blowBubbleRandom` does not send WS messages
**Severity:** Medium
**Location:** `apps/web/src/hooks/useBubbles.ts:31-61`

`StealthMode` calls `blowBubbleRandom(color)` which calls `createBubble()`. This function adds to the local store and sets a setTimeout, but **never sends a WebSocket `blow` message**. Bubbles blown in stealth mode are local-only -- other users never see them.

Compare with `BubbleScene.tsx:94-99` (visual mode) which explicitly sends via `globalWsClient.send(...)`.

**Fix:** Add WS send to `createBubble()` in `useBubbles.ts`:
```ts
if (globalWsClient.isConnected()) {
  globalWsClient.send({ type: 'blow', data: { size, color: tintedColor, pattern: 'plain', x, y, z } });
}
```

---

## 2. State Management

### HIGH: `lastCursorSent` Map grows without bound
**Severity:** High
**Location:** `apps/server/src/ws/handler.ts:26`

The `lastCursorSent` Map is keyed by `${placeId}:${sessionId}`. Entries are deleted in `onClose` and `onError`, but if a client disconnects ungracefully (no close frame, no error event -- e.g., network cable pull), the entry leaks. Over time with many users, this map grows unbounded.

**Fix:** Add periodic cleanup (e.g., in `cleanupStaleRooms`) or use a WeakMap keyed by WSContext, or add TTL-based eviction.

### HIGH: `wsStates` Map similarly leaks on ungraceful disconnect
**Severity:** High
**Location:** `apps/server/src/ws/handler.ts:35`

Same issue as `lastCursorSent`. If the WebSocket connection is killed at the TCP level without triggering `onClose` or `onError`, the `wsStates` entry persists forever.

**Fix:** The server should have a stale-connection sweep that checks `lastPingAt` and removes connections that haven't pinged within `WS_STALE_TIMEOUT`.

### MEDIUM: Map copying in Zustand bubble store creates new Map on every mutation
**Severity:** Medium
**Location:** `apps/web/src/stores/bubble-store.ts:16-19`

Every `addBubble` and `removeBubble` call creates `new Map(state.bubbles)`, copying all entries. With `MAX_BUBBLES = 80`, this copies up to 80 entries per mutation. At 8 bubbles/sec spawn rate, that's 640 map entry copies per second. This is acceptable for the current scale but scales poorly.

**Fix (if needed):** Use Immer or a plain object `Record<string, BubbleInfo>` which Zustand can shallow-compare more efficiently. For 80 bubbles this is not urgent.

### MEDIUM: Multiple subscription patterns in BubbleControls
**Severity:** Medium
**Location:** `apps/web/src/components/visual/BubbleControls.tsx:67-69`

`BubbleControls` subscribes to bubble count via `useBubbleStore.subscribe()` inside a `useEffect`, manually calling `setBubbleCount`. This is correct but redundant -- the standard pattern `useBubbleStore((s) => s.bubbles.size)` would be simpler and handled by Zustand's selector equality. The manual subscription is fine but creates a parallel pattern that differs from the rest of the codebase.

### LOW: Empty cleanup effect in useSound
**Severity:** Low
**Location:** `apps/web/src/hooks/useSound.ts:48-52`

```ts
useEffect(() => {
  return () => {
    // Don't dispose the singleton; it should persist across route changes
  };
}, []);
```

This effect does nothing. The comment explains the intent, but the code is dead. Remove the entire `useEffect` block.

---

## 3. Component Architecture

### MEDIUM: Duplicated bubble creation logic across three files
**Severity:** Medium
**Location:**
- `apps/web/src/hooks/useBubbles.ts:8-61` (`generateId`, `tintColor`, `randomSize`, `createBubble`)
- `apps/web/src/components/visual/BubbleScene.tsx:19-50` (`makeId`, `tint`, `randSize`, `createBubbleAt`)
- `apps/web/src/components/visual/BubbleControls.tsx:9-58` (`makeId`, `tint`, `randSize`, `spawnBatch`)

Three independent copies of the same bubble creation logic with slightly different implementations:
- Different ID generation schemes (`b_${Date.now()}_${++idCounter}_${random}` vs `s${Date.now()}_${++_c}` vs `b${Date.now()}_${++_counter}`)
- Different tint algorithms (amount-based vs fixed 60-range)
- All three create bubbles, set timeouts, and optionally send WS messages

This is a maintenance hazard. Changes to bubble creation must be applied in three places.

**Fix:** Consolidate into a single `spawnLocalBubble(color, x, y, z, sendToServer: boolean)` function in `useBubbles.ts` or a new `lib/bubble-factory.ts`. Both `BubbleScene` and `BubbleControls` should call it.

### MEDIUM: BubbleSpawner/BubbleRenderer split is correct but BubbleControls is redundant
**Severity:** Medium
**Location:** `apps/web/src/components/visual/BubbleControls.tsx`

`BubbleControls` is an HTML overlay that spawns bubbles at random positions when the user holds a button or presses Space. `BubbleSpawner` (inside the R3F canvas) does the same thing when the user holds mouse on the 3D plane but at the cursor position. Both are active simultaneously, meaning:
1. Spacebar triggers `BubbleControls.startBlowing()` which spawns at random world positions
2. Mouse hold triggers `BubbleSpawner` which spawns at cursor position
3. Both send WS messages independently
4. Both have independent spawn intervals (both 250ms)

This is likely intentional (button = random, click = targeted), but the spacebar in `BubbleControls` bypasses `BubbleSpawner`'s cursor-based positioning. Consider whether spacebar should also use cursor position.

### LOW: UserPresence filters by `sessionId !== 'local'`
**Severity:** Low
**Location:** `apps/web/src/components/visual/UserPresence.tsx:15`

The filter uses a hardcoded string `'local'` to exclude self. But the actual local user's sessionId comes from `useAuthStore` and is a UUID, not `'local'`. The `'local'` sessionId is only used in locally-created `BubbleInfo.blownBy.sessionId`. The server assigns real UUIDs. So this filter would never actually exclude the local user from the presence list -- the local user would appear as both a presence dot and themselves.

**Fix:** Compare against `useAuthStore.getState().sessionId` instead of the string `'local'`.

---

## 4. Error Handling

### CRITICAL: No auth endpoint exists on server
**Severity:** Critical
**Location:** `apps/web/src/routes/AuthCallback.tsx:24` and `apps/server/src/index.ts`

`AuthCallback` fetches `/api/auth/callback` but no auth route is registered on the server. The server has routes for `/health`, `/places`, and `/logs` only. The auth callback endpoint does not exist, so authentication will always fail with a 404.

**Fix:** Either implement the auth callback route on the server, or remove the `AuthCallback` page if auth is not yet implemented.

### HIGH: Server does not handle MongoDB disconnection gracefully at runtime
**Severity:** High
**Location:** `apps/server/src/db/mongo.ts`

If MongoDB becomes unreachable after initial connection:
- `logAction` silently catches and logs errors (good)
- `updatePlaceActivity` and `markPlaceForDeletion` catch errors (good)
- `getPlaceName` catches errors (good)
- REST routes (`places.ts`, `logs.ts`) do NOT catch MongoDB errors -- unhandled promise rejections will crash the server or return 500s without structured error responses

**Fix:** Add try/catch in route handlers or a global error middleware.

### MEDIUM: No user feedback when WS maxRetries is reached
**Severity:** Medium
**Location:** `apps/web/src/lib/ws-client.ts:83-86`

When max retries are exhausted, the client just logs `console.warn` and gives up. The UI shows a red dot (disconnected status) but never tells the user "Connection lost permanently -- please refresh." The user might wait indefinitely thinking the app is reconnecting.

**Fix:** Emit a new status like `'failed'` or show a toast/banner via `onConnectionChange`.

---

## 5. Performance

### CRITICAL: Per-bubble MeshPhysicalMaterial allocation
**Severity:** Critical (performance)
**Location:** `apps/web/src/components/visual/BubbleMesh.tsx:46-65`

Every `BubbleMesh` creates its own `MeshPhysicalMaterial` via `useMemo`. With 80 bubbles, that's 80 material instances. `MeshPhysicalMaterial` is the most expensive material in Three.js -- it compiles a unique shader program for each unique combination of parameters. While the `useMemo` deps `[bubbleColor, bubble.seed]` prevent re-creation on every frame, each bubble still has its own material instance with unique `iridescenceIOR` and `iridescenceThicknessRange` values derived from `bubble.seed`.

With 80 unique materials, the GPU must switch shader programs 80 times per frame, killing draw call batching.

**Fix:** Create a small pool of materials (e.g., 4-8 variants based on `seed % 4`) and share them across bubbles. Or use `InstancedMesh` with a single material and per-instance color attributes.

### HIGH: Each BubbleMesh runs its own useFrame callback
**Severity:** High
**Location:** `apps/web/src/components/visual/BubbleMesh.tsx:82-137`

80 bubbles = 80 `useFrame` registrations. R3F calls each one per frame. A single `useFrame` in the parent that iterates all bubbles via refs would be significantly faster.

**Fix:** Move physics update to a single `useFrame` in `BubbleRenderer` that iterates all mesh refs.

### MEDIUM: Raycaster created every spawn batch
**Severity:** Medium
**Location:** `apps/web/src/components/visual/BubbleScene.tsx:73`

`spawnBatch` creates `new THREE.Raycaster()` on every call (every 250ms while holding). Raycaster allocation is cheap but unnecessary.

**Fix:** Hoist to a module-level `const raycaster = new THREE.Raycaster()` and reuse.

### MEDIUM: PopEffect velocity clone on every frame
**Severity:** Medium
**Location:** `apps/web/src/components/visual/PopEffect.tsx:158`

`p.velocity.clone().multiplyScalar(delta)` creates a new `Vector3` every frame for every live particle. With `MAX_PARTICLES = 128` and 60fps, that's up to 7,680 allocations/sec.

**Fix:** Use a temporary `_tmpVec.copy(p.velocity).multiplyScalar(delta)` and `p.position.add(_tmpVec)`.

---

## 6. Code Quality

### MEDIUM: Duplicated color hash logic
**Severity:** Medium
**Location:**
- `apps/server/src/ws/handler.ts:79-81`
- `apps/server/src/middleware/auth.ts:72-74`

The same USER_COLORS array and hash computation is copy-pasted in two places. If colors are added/removed, both must be updated.

**Fix:** Extract to a shared utility function.

### LOW: Dead code -- `updateBubbleLegacy` and `BubbleState` type
**Severity:** Low
**Location:** `apps/web/src/physics/bubblePhysics.ts:272-310`

`BubbleState` interface and `updateBubbleLegacy` function are tagged as "Legacy compatibility" but no file imports or uses them.

**Fix:** Remove dead code.

### LOW: `growAnimation.ts` is never imported
**Severity:** Low
**Location:** `apps/web/src/physics/growAnimation.ts`

No file in the codebase imports from `growAnimation.ts`. The grow animation is implemented inline in `BubbleMesh.tsx:104-111`. This is dead code.

**Fix:** Remove the file or refactor `BubbleMesh` to use it.

### LOW: `getPlaceLogs` API client uses wrong pagination model
**Severity:** Low
**Location:** `apps/web/src/lib/api.ts:47-54`

The client function signature uses `page` parameter and expects `{ logs, total }`, but the server endpoint uses cursor-based pagination (`before` parameter) and returns `{ logs, hasMore, nextCursor }`. The response shape doesn't match.

**Fix:** Align the client function to match the server API.

---

## 7. Mobile Support

### MEDIUM: No touch event handling for bubble spawning on canvas
**Severity:** Medium
**Location:** `apps/web/src/components/visual/BubbleScene.tsx:121-126`

`BubbleSpawner` uses `onPointerDown` with `e.button !== 0` guard. On touch devices, pointer events work but:
1. `e.button` is always 0 for touch -- this is fine
2. However, the `OrbitControls` in `VisualMode.tsx` will intercept touch-drag for orbiting, competing with the invisible plane's pointer down for bubble spawning
3. The `cursor: 'none'` style on the container hides the cursor, which is appropriate for desktop but on mobile the cursor is already hidden and this triggers unnecessary CSS processing

**Fix:** Disable orbit on single-touch (use `touches.ONE = null`), or use a two-finger gesture for orbit and single-tap for bubble blowing.

### MEDIUM: BubbleControls button lacks proper touch handling
**Severity:** Medium
**Location:** `apps/web/src/components/visual/BubbleControls.tsx:134-143`

The blow button uses `onPointerDown`/`onPointerUp`/`onPointerLeave`. On mobile Safari, `onPointerLeave` may not fire reliably when the user's finger slides off the button. The `touchAction: 'none'` CSS is correctly set to prevent scrolling.

**Fix:** Add `onPointerCancel={stopBlowing}` as a safety net.

---

## 8. Stealth Mode

### CRITICAL: Stealth mode bubbles are local-only (see issue in Section 1)
**Severity:** Critical
**Location:** `apps/web/src/hooks/useBubbles.ts:31-61`

As detailed in Section 1, the `blowBubbleRandom` function used by stealth mode does not send WebSocket messages. Stealth mode is functionally a single-player experience -- other users in the same place will not see bubbles blown in stealth mode, and stealth-mode users will not see bubbles blown by others in visual mode (they will, actually, via the WS provider, but they can't blow back).

### MEDIUM: Stealth mode pop does not send WS message
**Severity:** Medium
**Location:** `apps/web/src/components/stealth/StealthMode.tsx:146-151`

`handlePopBubble` calls `popBubble(bubbleId)` which is just `removeBubble(bubbleId)` from the store. It does not send a `pop` WS message to the server, so other users don't see the pop.

**Fix:** Add `globalWsClient.send({ type: 'pop', data: { bubbleId } })` in the pop handler.

---

## Summary Table

| # | Severity | Category | Issue | Location |
|---|----------|----------|-------|----------|
| 1 | CRITICAL | Routing | API proxy missing rewrite -- all REST calls 404 | `vite.config.ts:16` |
| 2 | CRITICAL | Auth | No auth endpoint on server | `AuthCallback.tsx:24` |
| 3 | CRITICAL | Sync | Stealth mode bubbles are local-only | `useBubbles.ts:31` |
| 4 | CRITICAL | Perf | Per-bubble MeshPhysicalMaterial (80 shader switches/frame) | `BubbleMesh.tsx:46` |
| 5 | CRITICAL | Sync | Race: room_state overwrites bubbles received during async gap | `rooms.ts:113` |
| 6 | HIGH | Sync | setTimeout for remote bubbles not cleared on early pop | `WebSocketProvider.tsx:51` |
| 7 | HIGH | Reconnect | retryCount never resets -- permanent disconnect after 3 cycles | `ws-client.ts:51` |
| 8 | HIGH | Memory | `lastCursorSent` / `wsStates` Maps leak on ungraceful disconnect | `handler.ts:26,35` |
| 9 | HIGH | Error | Server REST routes don't catch MongoDB errors | `places.ts`, `logs.ts` |
| 10 | HIGH | Perf | 80 individual useFrame callbacks | `BubbleMesh.tsx:82` |
| 11 | MEDIUM | Sync | expireBubble race with removeBubble (pop) | `rooms.ts:221` |
| 12 | MEDIUM | Sync | Stealth pop does not send WS message | `StealthMode.tsx:146` |
| 13 | MEDIUM | Code | Bubble creation logic duplicated in 3 files | multiple |
| 14 | MEDIUM | Code | Color hash logic duplicated in 2 server files | `handler.ts:79`, `auth.ts:72` |
| 15 | MEDIUM | State | Map copying on every bubble mutation | `bubble-store.ts:16` |
| 16 | MEDIUM | UX | No user feedback when WS reconnection gives up | `ws-client.ts:83` |
| 17 | MEDIUM | Perf | Raycaster allocated every 250ms | `BubbleScene.tsx:73` |
| 18 | MEDIUM | Perf | Vector3 clone per particle per frame | `PopEffect.tsx:158` |
| 19 | MEDIUM | Mobile | Touch/orbit conflict on canvas | `BubbleScene.tsx:121` |
| 20 | MEDIUM | Mobile | Missing onPointerCancel on blow button | `BubbleControls.tsx:134` |
| 21 | LOW | Code | Dead code: updateBubbleLegacy, growAnimation.ts | `bubblePhysics.ts:272` |
| 22 | LOW | Code | API client pagination model mismatches server | `api.ts:47` |

---

## Recommended Priority Order

1. **Fix API proxy rewrite** (unblocks all REST API functionality)
2. **Fix retryCount reset** (prevents permanent disconnection)
3. **Add WS send to stealth mode** (makes it actually multiplayer)
4. **Fix room_state race condition** (prevents lost bubbles on join)
5. **Consolidate bubble creation logic** (reduces maintenance burden)
6. **Implement material pooling** (major perf win for 3D rendering)
7. **Single useFrame loop** (perf improvement)
8. **Add stale connection cleanup** (prevents memory leaks on server)
9. **Clear remote bubble timers on pop** (correctness)
10. **Fix remaining medium/low issues** (cleanup pass)
