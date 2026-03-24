## Performance Follow-up Review (R07) — Post-R05 Fixes

**Reviewer focus**: Verify R05 findings were addressed; identify any regressions or remaining issues.

---

### R05 Finding Status

| R05# | Issue | Status | Notes |
|------|-------|--------|-------|
| 1 | 80 material clones = 80 draw calls | **Fixed** | Single `InstancedMesh` with shared material, per-instance opacity via `onBeforeCompile` attribute |
| 2 | Raycaster allocated every spawn tick | **Fixed** | `_raycaster` hoisted to module scope (`BubbleScene.tsx:81`) |
| 3 | N useFrame callbacks (one per bubble) | **Fixed** | Single `useFrame` loop in `BubbleInstances.tsx:196` iterates all bubbles |
| 4 | shouldNaturallyPop creates PRNG every frame | **Not fixed** | `seededRandom()` still instantiated per-bubble per-frame at `bubblePhysics.ts:260` |
| 5 | PopEffect useState causes re-renders | **Not fixed** | `usePopEffect` still uses `useState<PopEvent[]>` (`PopEffect.tsx:68`) and `setPops` triggers re-renders |
| 6 | Bubble store new Map on every mutation | **Acceptable** | Noted as low-severity; unchanged |
| 7 | Duplicate expiry timers | **Fixed** | `WebSocketProvider` no longer sets its own `setTimeout`; relies on server `bubble_expired` events and `BubbleInstances` expiry check |
| 8 | lastCursorSent never cleaned up | **Unknown** | Not in scope of reviewed files |
| 9 | Redis KEYS command | **Fixed** | Replaced with `redisScanKeys()` using cursor-based `SCAN` (`rooms.ts:396-405`) |
| 10 | Excessive pointLights | **Unknown** | Not in scope of reviewed files |
| 11 | popBubble uses spawn position | **Not fixed** | `handleExpire` in `BubbleScene.tsx:198` still reads `b.x, b.y, b.z` (spawn position) for the pop effect. The click-pop path (`handlePop`) correctly uses the live physics position. |
| 12 | console.log on every WS message | **Partially fixed** | `ping` and `cursor` are now excluded (`handler.ts:134`). Other message types (`blow`, `pop`, joins, leaves) still logged unconditionally. |
| 13 | No WS message batching | **Acceptable** | Low-severity; unchanged |

---

### New Issues Introduced by the Fix

#### N1. Per-frame `setColorAt` for every active bubble — unnecessary GPU upload
- **Severity**: low
- **Location**: `BubbleInstances.tsx:278`
- **Description**: `mesh.setColorAt(entry.slotIndex, entry.color)` is called every frame for every bubble, and `instanceColor.needsUpdate = true` (line 288) is set whenever any matrix is dirty (which is every frame bubbles exist). Bubble color never changes after creation. This causes the entire `instanceColor` buffer to be re-uploaded to the GPU every frame for no reason.
- **Suggestion**: Set color once when the bubble is added (in the store subscription handler around line 171) and only flag `instanceColor.needsUpdate` there. Remove the per-frame `setColorAt` call.

#### N2. Slot lookup on click/hover is O(n) — linear scan of stateMap
- **Severity**: low
- **Location**: `BubbleInstances.tsx:307-319`, `BubbleInstances.tsx:332-337`
- **Description**: `handleClick` and `handlePointerMove` iterate the entire `stateMap` to find which bubble owns `instanceId` (slot index). With 80 bubbles this is trivially fast, but the pattern is O(n). A reverse lookup `Map<slotIndex, bubbleId>` would make it O(1).
- **Suggestion**: Maintain a `slotToId` map alongside `stateMap`, updated in the subscription handler. Lookup becomes `slotToId.get(instanceId)`.

#### N3. `handlePointerMove` calls `setHoveredId` (React `useState`) on every pointer move event
- **Severity**: medium
- **Location**: `BubbleInstances.tsx:325-339`, `BubbleInstances.tsx:48`
- **Description**: Every `onPointerMove` event over the InstancedMesh triggers `setHoveredId()`, which schedules a React re-render of `BubbleInstances`. At 60fps with the mouse moving over bubbles, this can produce dozens of re-renders per second. The re-render also recalculates `hoveredEntry` and `tooltipPos` (lines 346-353) from refs, but the React reconciliation cost is non-trivial since it includes the `<Html>` portal component from drei.
- **Suggestion**: Debounce or gate the `setHoveredId` call — only call it when the hovered ID actually changes. A simple guard: `if (id !== hoveredId) setHoveredId(id)`. Note that `hoveredId` must be captured via ref to avoid stale closure, or use a functional update pattern.

#### N4. Ticket store has no size cap — potential memory exhaustion under abuse
- **Severity**: low
- **Location**: `apps/server/src/routes/auth.ts:12`
- **Description**: The in-memory `tickets` map grows unboundedly until the 60-second cleanup interval runs. An attacker repeatedly calling `POST /ws-ticket` with a valid JWT could accumulate many thousands of entries in 60 seconds. Each entry is small (~100 bytes), so this requires sustained high-rate abuse to matter, but there is no cap.
- **Suggestion**: Add a maximum size check (e.g., 10,000 entries) and reject new tickets if exceeded.

#### N5. `_pos.clone()` in click handler — per-click allocation
- **Severity**: negligible
- **Location**: `BubbleInstances.tsx:314`
- **Description**: `onPopRef.current(id, _pos.clone(), ...)` allocates a new Vector3 on every click. This is fine since clicks are infrequent, but it defeats the purpose of the scratch `_pos` object. Mentioned only for consistency with the zero-allocation philosophy.

---

### InstancedMesh Deep Dive

**Single useFrame loop efficiency**: Good. The loop at line 208 iterates only active entries in `stateMap`, not all 80 slots. `Date.now()` is called once (line 203), fixing the R05 concern about per-bubble `Date.now()`. The `dt` clamp (`Math.min(delta, 0.05)`) prevents physics explosions on tab-resume.

**Per-frame allocations**: The loop body is allocation-free. All scratch objects (`_dummy`, `_color`, `_pos`) are module-scoped. The `expired` array (line 206) is allocated per frame as `const expired: string[] = []` — this is a minor GC pressure point at 60fps but only matters if bubbles are actively expiring. For the common case (no expiry), the array is created but never pushed to.

**Slot allocator**: The free-slots stack (`freeSlotsRef`) uses `push`/`pop`, which is O(1) amortized. Allocation is O(1), deallocation is O(1). The initial fill is O(MAX_BUBBLES) once.

**Instance count**: `mesh.count` is set to `MAX_BUBBLES` (80) always, not `activeCountRef.current`. This means Three.js draws all 80 instances every frame even if only 5 are active. Inactive instances are hidden via scale=0, which still costs vertex processing. Setting `mesh.count = activeCountRef.current` and packing active instances into contiguous low slots would eliminate wasted vertex shader invocations. However, this would require remapping slot indices on every add/remove, which adds complexity. At 80 instances with a simple icosahedron, the wasted vertex work is negligible.

**Matrix upload**: `instanceMatrix.needsUpdate = true` is set every frame when any bubble exists (`matrixDirty` is always true if stateMap is non-empty, since every bubble updates its matrix). This uploads the full 80-instance matrix buffer every frame. Acceptable at this scale.

---

### stateMap Growth Analysis

**Does stateMap grow unbounded?** No. Entries are added only when a bubble appears in the Zustand store, and removed when it disappears. The store itself caps at `MAX_BUBBLES` (80) on the spawn side, and the server enforces its own limit. The subscription handler (line 144) correctly removes stateMap entries when the store entry is gone, returning the slot to the free list.

**Potential leak scenario**: If `useBubbleStore` fires a state update that adds a bubble, but the bubble is removed from the store before the next subscription callback (e.g., removed synchronously in the same microtask), the stateMap entry would never be created. This is harmless. The reverse — stateMap entry persists after store removal — cannot happen because the subscription iterates all stateMap entries and checks against the store.

---

### Ticket Exchange Latency

The `doConnect` flow (`ws-client.ts:48-68`) now performs an HTTP POST to `/api/auth/ws-ticket` before opening the WebSocket. This adds one round-trip (~5-50ms on the same host, ~50-200ms cross-region). The ticket exchange only happens when `this.token` is set (authenticated users). Anonymous users skip it entirely.

**Impact**: Minimal. The added latency is one-time per connection (including reconnects). The `try/catch` silently falls through to anonymous mode on failure, so it cannot block the connection. The concern is reconnect speed after a server restart (code 1012) — the 500ms delay at `ws-client.ts:113` already dwarfs the ticket exchange cost.

---

### Summary of Remaining Action Items

| Priority | Item | Effort |
|----------|------|--------|
| Medium | N3: Gate `setHoveredId` to only fire on actual change | Small |
| Low | R05#4: Cache PRNG per bubble instead of recreating per frame | Medium |
| Low | R05#5: Move PopEffect to `useRef` instead of `useState` | Small |
| Low | N1: Set color once at creation, not every frame | Small |
| Low | N2: Add reverse slot-to-id lookup map | Small |
| Low | R05#11: Use live physics position for expire pop effect | Small |
| Negligible | N4: Cap ticket store size | Small |

Overall, the critical R05 findings (InstancedMesh, single useFrame, Redis SCAN, duplicate timers) have been addressed well. The remaining items are low-severity optimizations.
