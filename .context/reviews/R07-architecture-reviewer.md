## Architecture Review (R07) -- Follow-up on R05 Findings

Reviewer: Principal Software Architect
Scope: Ticket exchange (auth.ts), InstancedMesh (BubbleInstances.tsx), and all files changed to address R05 findings.

---

### R05 Finding Disposition

| R05# | Finding | Status | Notes |
|------|---------|--------|-------|
| 1 | JWT in WebSocket query param | **Fixed** | Ticket exchange implemented correctly |
| 2 | Silent catch on JWT failure | **Fixed** | Auth error sent to client with `TICKET_INVALID` code, logged with `console.warn` |
| 3 | Client-controlled `expiresAt` | **Fixed** | Server now computes `expiresAt = now + duration` (handler.ts:169) |
| 4 | rooms.ts SRP violation | **Not addressed** | rooms.ts is still ~494 lines with mixed concerns |
| 5 | God-function switch statement | **Not addressed** | `onMessage` still a monolithic switch |
| 6 | Circular dependency rooms/pubsub | **Not addressed** | `rooms.ts` imports from `pubsub.ts` and vice versa |
| 7 | Fire-and-forget Redis writes | **Not addressed** | Lines 215, 261, 353, 368, 385 still call without `await` |
| 8 | `KEYS` replaced with `SCAN` | **Fixed** | `redisScanKeys` helper uses cursor-based SCAN |
| 9 | Dual session ID sources | Unknown | Not in scope of changed files |
| 10 | `set_name` sanitization | **Fixed** | Strips HTML entities and control characters (handler.ts:265) |
| 11 | `as any` cast on blow msg | **Fixed** | No `as any` casts remain in handler.ts |
| 12 | Duplicate bubble expiry timers | **Fixed** | WebSocketProvider no longer sets client-side expiry for remote bubbles; relies on server `bubble_expired` |
| 13 | Module-level Redis singleton | **Not addressed** | Out of scope for this change |
| 14 | `id` vs `bubbleId` naming | **Not addressed** | `ActiveBubble.id` still diverges from `BubbleInfo.bubbleId` |
| 15 | `lastCursorSent` leak | **Partially fixed** | Both `onClose` and `onError` now clean up `lastCursorSent`, but no idempotency guard -- `decGauge` is called in both paths, so if both fire, the gauge goes negative |
| 16 | Window global singleton | **Not addressed** | Acceptable for SPA |
| 17 | No message schema validation | **Not addressed** | Still `JSON.parse` -> type assertion |

**Summary: 6 fixed, 1 partially fixed, 7 not addressed, 3 acceptable/out-of-scope.**

The three high-severity findings (1, 2, 3) are all fixed. Good prioritization.

---

### New Findings

#### 1. Ticket store is in-memory -- breaks multi-pod deployments
- **Severity**: high
- **Description**: `auth.ts` stores tickets in a module-level `Map`. In a multi-pod deployment behind a load balancer, the HTTP POST to `/auth/ws-ticket` may hit pod A, but the WebSocket upgrade (which calls `consumeTicket`) hits pod B. Pod B has no knowledge of the ticket and rejects it, silently falling back to anonymous. This defeats the purpose of the ticket exchange for any authenticated user whose requests don't hit the same pod.
- **Location**: `apps/server/src/routes/auth.ts:12`
- **Suggestion**: Store tickets in Redis (which is already available) with a 30-second TTL using `SET ticket:<uuid> <json> EX 30`. `consumeTicket` becomes `GETDEL ticket:<uuid>` (atomic get-and-delete). This is a one-liner change and makes the ticket exchange work correctly across pods.

#### 2. `onError` + `onClose` double-decrement of `ws_connections_active` gauge
- **Severity**: medium
- **Description**: Both `onError` (handler.ts:338) and `onClose` (handler.ts:326) call `decGauge('ws_connections_active')`. In most WebSocket implementations (including Bun's), `onError` fires first and then `onClose` fires. The `onClose` handler checks `sessionStates.has(sessionId)` via the early return, so if `onError` already deleted the state, `onClose` returns early and the second `decGauge` is avoided. However, if `onClose` fires independently (normal close, no error), and then a delayed `onError` fires for the same session, the `onError` handler will find the state already deleted and skip `decGauge` -- this path is safe. The real risk: if the Hono/Bun WebSocket adapter delivers `onError` with the state still present and then also delivers `onClose` with the state still present (race condition before the delete takes effect), both paths execute and the gauge goes to -1. This is unlikely but worth guarding against.
- **Location**: `apps/server/src/ws/handler.ts:326-342`
- **Suggestion**: Extract cleanup into a single idempotent `cleanupSession()` function with a guard (`if (!sessionStates.has(sessionId)) return`). Call it from both `onClose` and `onError`. This was the original R05 suggestion (finding 15).

#### 3. Slot-to-bubble reverse lookup is O(n) on every click/hover
- **Severity**: medium
- **Description**: `handleClick` and `handlePointerMove` in `BubbleInstances.tsx` iterate the entire `stateMap` to find which bubble corresponds to a given `instanceId` (slot index). With MAX_BUBBLES=80 this is negligible, but the linear scan is unnecessary and the pattern won't scale if MAX_BUBBLES increases.
- **Location**: `apps/web/src/components/visual/BubbleInstances.tsx:307-319`, `332-337`
- **Suggestion**: Maintain a reverse map `slotIndex -> bubbleId` alongside the forward `stateMap`. Update it when slots are allocated and freed. This makes lookups O(1).

#### 4. `setColorAt` called every frame for every bubble is wasteful
- **Severity**: low
- **Description**: Inside the `useFrame` loop (BubbleInstances.tsx:278), `mesh.setColorAt(entry.slotIndex, entry.color)` is called for every bubble every frame. Bubble colors never change after creation. This forces Three.js to mark the instance color buffer as dirty and upload it to the GPU every frame unnecessarily.
- **Location**: `apps/web/src/components/visual/BubbleInstances.tsx:278`
- **Suggestion**: Set color once when the bubble is added to the stateMap (in the store subscription effect). Only set `instanceColor.needsUpdate = true` when a bubble is actually added or removed, not every frame.

#### 5. Shared `_dummy` Object3D is not safe if BubbleInstances is mounted multiple times
- **Severity**: low
- **Description**: `_dummy`, `_color`, and `_pos` are module-level singletons (BubbleInstances.tsx:32-34). If two `BubbleInstances` components were ever mounted simultaneously (e.g., split-screen, portals), they would corrupt each other's matrix computations. This is unlikely in the current app but is a latent fragility.
- **Location**: `apps/web/src/components/visual/BubbleInstances.tsx:32-34`
- **Suggestion**: Move scratch objects into the component (via `useRef`) or document the single-mount constraint. For a single-instance scenario this is acceptable as-is.

#### 6. `handleExpire` removes from store but does not cancel expiry timer
- **Severity**: low
- **Description**: When `BubbleInstances.useFrame` detects a bubble has expired (client-side), it calls `onExpireRef.current(id)` which maps to `handleExpire` in `BubbleScene.tsx:193`. This calls `removeBubble` on the store but does not call `cancelExpiry(bubbleId)`. For locally-blown bubbles, `scheduleExpiry` in `BubbleScene.tsx` has already set a timer. If the InstancedMesh visual expiry fires before the `scheduleExpiry` timer, the timer will later call `removeBubble` on an already-removed bubble (harmless but wasteful). Conversely, if the timer fires first and removes the bubble from the store, the `useFrame` loop will never see it as expired (the store subscription effect will clean it from `stateMap`). So there's no functional bug, but the two independent expiry paths (InstancedMesh visual animation vs `scheduleExpiry` setTimeout) are the same dual-timer pattern that R05 finding 12 flagged.
- **Location**: `apps/web/src/components/visual/BubbleInstances.tsx:248-249`, `apps/web/src/components/visual/BubbleScene.tsx:193-206`
- **Suggestion**: For locally-blown bubbles, call `cancelExpiry(bubbleId)` in `handleExpire` to prevent the redundant timer from firing. This keeps one authoritative expiry path per bubble type: server `bubble_expired` for remote, `scheduleExpiry` for local (with the visual animation as a secondary effect, not a removal trigger).

#### 7. Ticket exchange silently falls back to anonymous on network error
- **Severity**: low
- **Description**: In `ws-client.ts:65`, if the `fetch('/api/auth/ws-ticket')` call throws (network error, server down), the `catch` block silently proceeds with an anonymous connection. The user sees no indication that their authentication was lost. Combined with finding 1 (ticket store is in-memory), this means authenticated users may silently become anonymous more often than expected.
- **Location**: `apps/web/src/lib/ws-client.ts:65-67`
- **Suggestion**: Log a warning. Optionally surface this to the UI via the `onConnectionChange` callback or a dedicated auth state callback so the user knows they're connected anonymously despite being logged in.

---

### Architectural Assessment

**Ticket Exchange (auth.ts)**
The separation of concerns is clean: `createTicket` and `consumeTicket` are pure data operations, the Hono route handler deals with HTTP, and the WS handler calls `consumeTicket` at upgrade time. The design is testable -- you can unit-test `createTicket`/`consumeTicket` without HTTP. The critical gap is the in-memory store (finding 1 above), which must be Redis-backed for multi-pod correctness.

**InstancedMesh Architecture (BubbleInstances.tsx)**
This is a well-structured replacement for individual BubbleMesh components. Key strengths:
- Slot allocator with free-list recycling avoids InstancedMesh resizing
- Physics state stored in refs (outside React) for zero-allocation frame updates
- Store subscription via `useBubbleStore.subscribe` avoids re-renders on every bubble change
- Per-instance opacity via `onBeforeCompile` shader injection is the correct Three.js pattern
- Scratch objects (`_dummy`, `_color`) avoid per-frame allocations

The main weakness is the O(n) reverse lookup on click (finding 3) and the per-frame color upload (finding 4), both of which are performance inefficiencies rather than correctness issues at the current scale.

**Remaining R05 Debt**
The medium-severity structural findings (SRP violation in rooms.ts, circular dependency, god-function switch, fire-and-forget Redis, schema validation) are all still open. These are not regressions but represent accumulated technical debt that will compound as the codebase grows. The circular dependency (rooms <-> pubsub) in particular should be prioritized before adding more message types or room features.

---

### Summary

| Severity | Count |
|----------|-------|
| Critical | 0     |
| High     | 1     |
| Medium   | 2     |
| Low      | 4     |

**Top priorities:**
1. Move ticket store to Redis (finding 1) -- required for multi-pod auth to work
2. Consolidate `onError`/`onClose` cleanup into idempotent function (finding 2)
3. Address remaining R05 medium-severity structural debt (R05 findings 4, 5, 6, 7)
