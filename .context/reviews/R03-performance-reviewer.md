# R03 — Performance Review

**Reviewer**: Performance Engineer (Claude Opus 4.6)
**Date**: 2026-03-23
**Scope**: GPU, CPU, memory, rendering scalability, network, bundle size

---

## Executive Summary

The app can likely sustain 50-80 bubbles at 60fps on mid-range hardware, but with significant headroom waste. The primary bottleneck is **per-bubble MeshPhysicalMaterial** causing N draw calls and N shader compilations. Secondary issues include Map-copy-on-write in Zustand, N useFrame callbacks, and setTimeout accumulation. Fixing the top 3 issues would roughly double the bubble capacity ceiling.

---

## 1. GPU Performance

### 1.1 CRITICAL — Per-bubble MeshPhysicalMaterial (N draw calls, N shader compilations)

**File**: `apps/web/src/components/visual/BubbleMesh.tsx:46-65`
**Impact**: Each bubble creates its own `MeshPhysicalMaterial`. With 80 bubbles, this means:
- **80 draw calls** — no batching possible since materials differ
- **Up to 80 shader compilations** on first render — `MeshPhysicalMaterial` with iridescence is one of three.js's most expensive shaders. Each unique `iridescenceIOR` / `iridescenceThicknessRange` value compiles a separate shader program (though the GLSL source is identical, WebGL treats different uniform values as the same program — so the real cost is draw call overhead, not shader recompilation per se). Still, the first compilation of this material variant causes a visible frame stutter.
- **No instancing possible** — `InstancedMesh` requires a single shared material

**Fix**: Share a single material, pass per-bubble variation via instance attributes or uniforms:

```tsx
// BubbleScene.tsx — create ONE shared material
const sharedMaterial = useMemo(() => {
  return new THREE.MeshPhysicalMaterial({
    color: '#ffffff',
    metalness: 0.1,
    roughness: 0.0,
    transparent: true,
    opacity: 0.5,
    iridescence: 1.0,
    iridescenceIOR: 1.35,
    iridescenceThicknessRange: [200, 500],
    envMapIntensity: 3.0,
    clearcoat: 1.0,
    clearcoatRoughness: 0.0,
    side: THREE.DoubleSide,
    depthWrite: false,
    emissive: '#ffffff',
    emissiveIntensity: 0.15,
  });
}, []);

// Then use InstancedMesh with per-instance color via instanceColor
// and update transforms in a SINGLE useFrame callback
```

For per-bubble color variation, use `InstancedMesh.instanceColor` (built-in support). For per-bubble opacity animation, use `onBeforeRender` or a custom shader with instance attributes.

**Ideal architecture**: Single `InstancedMesh` with a custom shader that reads per-instance attributes (color, opacity, scale) from `InstancedBufferAttribute`. This reduces 80 draw calls to **1 draw call**.

### 1.2 HIGH — depthWrite: false on transparent materials without sorting

**File**: `apps/web/src/components/visual/BubbleMesh.tsx:59`
**Impact**: `depthWrite: false` is correct for transparency, but three.js sorts transparent objects back-to-front every frame. With 80 transparent bubbles, this is an O(N log N) sort per frame on the CPU side. With instancing, this sort disappears entirely.

### 1.3 LOW — Environment map loaded per-theme switch

**File**: `apps/web/src/components/visual/SkyEnvironment.tsx:58,89,125`
**Impact**: `<Environment preset="..." />` loads an HDR cubemap. Switching themes triggers a new fetch + GPU upload. Not a runtime perf issue but causes a stutter on theme change.

### 1.4 LOW — BubbleWandCursor creates 3 meshes with 3 materials inline

**File**: `apps/web/src/components/visual/BubbleWandCursor.tsx:26-51`
**Impact**: 3 extra draw calls. Negligible vs the bubble cost, but the `meshStandardMaterial` JSX elements recreate material objects on every mount. Use `useMemo` or extract to module-level constants.

---

## 2. CPU Performance

### 2.1 CRITICAL — N useFrame callbacks (one per BubbleMesh)

**File**: `apps/web/src/components/visual/BubbleMesh.tsx:82-137`
**Impact**: Each `BubbleMesh` registers its own `useFrame`. With 80 bubbles:
- 80 function calls per frame from react-three-fiber's internal loop
- 80 `physicsRef.current` updates
- 80 `Date.now()` calls (line 92)
- 80 `material.opacity = ...` assignments (line 136)

R3F's useFrame dispatcher has overhead per registration (~0.01ms each, so ~0.8ms for 80 — noticeable in a 16.6ms frame budget).

**Fix**: Centralize physics + transform updates into a single useFrame:

```tsx
// Single useFrame in BubbleScene that iterates all bubbles
useFrame((state, delta) => {
  const time = state.clock.elapsedTime;
  const dt = Math.min(delta, 0.05);
  const now = Date.now(); // call ONCE

  for (const [id, mesh] of meshRefs.current) {
    const physics = physicsStates.current.get(id);
    if (!physics || !mesh) continue;

    const newPhysics = updateBubble(physics, dt, time);
    physicsStates.current.set(id, newPhysics);
    mesh.position.set(...newPhysics.position);
    // ... scale, opacity logic
  }
});
```

### 2.2 HIGH — Physics: 3 simplex noise calls per bubble per frame

**File**: `apps/web/src/physics/bubblePhysics.ts:158-168`
**Impact**: `noise()` (simplex-noise 3D) is ~200ns per call. With 80 bubbles: 80 * 3 = 240 calls/frame = ~48us. Not catastrophic, but it's the most expensive per-bubble computation. The noise field is spatially coherent, so nearby bubbles get similar values.

**Fix (if needed)**: Sample noise on a coarse 3D grid and interpolate, or reduce to 2 noise calls (combine X/Z into one).

### 2.3 HIGH — updateBubble creates a new object every frame

**File**: `apps/web/src/physics/bubblePhysics.ts:217-226`
**Impact**: `updateBubble` returns a new `BubblePhysicsState` object every frame. With 80 bubbles at 60fps = **4,800 object allocations/second**. Each allocation is ~7 fields. This creates GC pressure.

**Fix**: Mutate in place:

```ts
export function updateBubbleInPlace(
  state: BubblePhysicsState,
  dt: number,
  globalTime: number,
  config: PhysicsConfig = DEFAULT_CONFIG,
): void {
  if (state.isDead) return;
  // ... mutate state.position, state.velocity, state.age directly
}
```

### 2.4 MEDIUM — shouldNaturallyPop creates a seededRandom per tick per bubble

**File**: `apps/web/src/physics/bubblePhysics.ts:259-260`
**Impact**: When `progress > 0.7`, every frame creates a new `seededRandom` closure. This is called from `updateBubble` which is called 80 times/frame. The function itself is cheap (~10ns), but it's unnecessary allocation.

**Fix**: Use a direct hash function instead of creating a PRNG:

```ts
function hashPop(seed: number, tick: number): number {
  let s = (seed * 1337 + tick + 0x6d2b79f5) | 0;
  let t = Math.imul(s ^ (s >>> 15), 1 | s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
```

---

## 3. Memory

### 3.1 CRITICAL — Zustand Map copy-on-write for every add/remove

**File**: `apps/web/src/stores/bubble-store.ts:16-20`
**Impact**: `addBubble` and `removeBubble` both do `new Map(state.bubbles)`. With 80 bubbles, each copy allocates a Map with 80 entries. At peak spawn rate (8 bubbles/sec), plus expiry removals, this could be 16+ Map copies/sec, each copying 80 entries.

Additionally, `BubbleRenderer` (line 139 of BubbleScene.tsx) subscribes to `s.bubbles`, meaning **every** add/remove triggers a re-render of the entire bubble list. The `useMemo(() => Array.from(bubbles.values()), [bubbles])` on line 166 creates a new array each time.

**Fix**: Use Zustand's `immer` middleware or switch to a mutable store pattern with manual subscription:

```ts
// Option A: Use Zustand subscribeWithSelector + shallow compare on size
const bubbleCount = useBubbleStore((s) => s.bubbles.size);

// Option B: Separate "version" counter, only re-render on version change
addBubble: (bubble) => set((state) => {
  state.bubbles.set(bubble.bubbleId, bubble); // mutate
  return { bubbles: state.bubbles, version: state.version + 1 };
}),
```

Actually, the cleanest fix: **don't store bubbles in React state at all for rendering**. Store them in a plain `Map` outside React, and have the single `useFrame` callback read from it directly. Only use React state for the UI bubble count display.

### 3.2 HIGH — setTimeout per bubble with no cancellation tracking

**File**: `apps/web/src/components/visual/BubbleScene.tsx:91`
**Impact**: Each spawned bubble schedules a `setTimeout` for its lifetime. If the component unmounts (e.g., route change) before the timeout fires, the callback runs on a stale store reference. With `useBubbleStore.getState()` this won't crash, but:
- The timeouts are never cancelled on unmount
- If bubbles are popped/removed early, the timeout still fires (harmless but wasteful — calling `removeBubble` on an already-removed ID copies the entire Map for nothing)

**Fix**: Track timeout IDs and clear them on unmount. Also skip the remove if the bubble is already gone:

```tsx
// In BubbleSpawner
const timeoutIds = useRef<Map<string, number>>(new Map());

useEffect(() => {
  return () => {
    // Cleanup all pending timeouts on unmount
    for (const id of timeoutIds.current.values()) {
      clearTimeout(id);
    }
    timeoutIds.current.clear();
  };
}, []);

// When spawning:
const timerId = window.setTimeout(() => {
  timeoutIds.current.delete(bubble.bubbleId);
  const store = useBubbleStore.getState();
  if (store.bubbles.has(bubble.bubbleId)) {
    store.removeBubble(bubble.bubbleId);
  }
}, lt);
timeoutIds.current.set(bubble.bubbleId, timerId);
```

### 3.3 MEDIUM — Material disposal relies on useEffect cleanup order

**File**: `apps/web/src/components/visual/BubbleMesh.tsx:67`
**Impact**: `material.dispose()` is correctly called on cleanup, which is good. However, if the component is removed but the mesh still references the material in the same frame, three.js may try to render with a disposed material. This is a race condition — unlikely to cause visible issues but can trigger WebGL warnings.

### 3.4 LOW — Geometry shared correctly

**File**: `apps/web/src/components/visual/BubbleScene.tsx:17`
**Impact**: `sharedGeo` is a module-level singleton `IcosahedronGeometry(1, 3)` — this is correct and efficient. 162 vertices, shared across all bubbles. No issue here.

---

## 4. Rendering Scalability (50-80 bubbles at 60fps)

### Assessment

| Component | Cost per bubble | At 80 bubbles |
|-----------|----------------|---------------|
| Draw calls | 1 | 80 (high) |
| useFrame callbacks | 1 | 80 (high) |
| Noise evaluations | 3 | 240 (moderate) |
| Object allocations/frame | 1 BubblePhysicsState | 80 (moderate) |
| Map copies on state change | full Map copy | 80-entry copy per add/remove (high) |

**Bottleneck ranking**:
1. **Draw calls** (80 individual draws with MeshPhysicalMaterial + iridescence)
2. **React re-renders** (Map copy + Array.from + reconciliation on every add/remove)
3. **useFrame overhead** (80 individual callbacks)
4. **Physics allocations** (4800 objects/sec GC pressure)

**Verdict**: On a modern discrete GPU (RTX 3060+), 80 bubbles will likely hold 60fps. On integrated GPUs (Intel UHD, Apple M1 base), the MeshPhysicalMaterial with iridescence + clearcoat will likely drop to 30-45fps at 80 bubbles. The CPU side (React re-renders) will cause periodic frame drops during rapid spawning/expiry.

**With instancing fix**: Would comfortably handle 200+ bubbles at 60fps on all hardware.

---

## 5. Network

### 5.1 LOW — WS message per bubble spawn

**File**: `apps/web/src/components/visual/BubbleScene.tsx:94-98`
**Impact**: At peak spawn rate (2 bubbles per 250ms tick = 8/sec), each sends a separate WS message. Messages are small (~100 bytes JSON), so this is fine. However, batching 2 messages into one per tick would halve the WS frame overhead.

### 5.2 LOW — maxRetries = 3 with no user feedback

**File**: `apps/web/src/lib/ws-client.ts:13,83-84`
**Impact**: After 3 failed reconnection attempts (1s, 2s, 4s delays), the client gives up silently. Total retry window is only ~7 seconds. For a real-time app, this is too aggressive — a brief network blip longer than 7s permanently disconnects the user with no UI indication.

**Fix**: Increase `maxRetries` to 10+ or remove the cap entirely (the exponential backoff with `maxReconnectDelay: 30000` is sufficient protection). Add a reconnect button in the UI.

### 5.3 LOW — No message batching or throttling for pops

**File**: `apps/web/src/components/visual/BubbleMesh.tsx:77-79`
**Impact**: If a user rapidly clicks multiple bubbles, each pop sends an individual WS message. Low severity since pops are user-initiated and naturally rate-limited.

### 5.4 INFO — Ping interval is reasonable

**File**: `apps/web/src/lib/ws-client.ts:101-103`
**Impact**: 20s ping interval is standard. No issue.

---

## 6. Bundle Size

### 6.1 MEDIUM — Full three.js import

**File**: `apps/web/src/components/visual/BubbleMesh.tsx:3`
**Impact**: `import * as THREE from 'three'` — modern bundlers (Vite/webpack) tree-shake this, so the star import itself is fine. However, `MeshPhysicalMaterial` pulls in the full PBR shader pipeline. The iridescence extension adds ~2KB of GLSL that's compiled at runtime.

### 6.2 LOW — simplex-noise imported at top level

**File**: `apps/web/src/physics/bubblePhysics.ts:1`
**Impact**: `simplex-noise` is ~2KB gzipped. It's used in the physics loop which is always needed when bubbles are visible. Not worth lazy-loading.

### 6.3 INFO — Code splitting opportunity

The `VisualMode` component could be lazy-loaded since it pulls in `@react-three/fiber`, `@react-three/drei`, and all 3D code. If there are non-visual routes in the app, wrapping `VisualMode` in `React.lazy()` would defer ~200KB+ of three.js.

---

## 7. Quick Wins (effort vs impact)

| Priority | Issue | Fix | Effort | Impact |
|----------|-------|-----|--------|--------|
| 1 | N draw calls | InstancedMesh + shared material | 1-2 days | 10x capacity |
| 2 | N useFrame callbacks | Single centralized loop | 0.5 day | -1ms/frame |
| 3 | Map copy-on-write | Mutable store or external Map | 0.5 day | Eliminates GC spikes |
| 4 | setTimeout leak | Track + cancel on unmount | 1 hour | Prevents stale removes |
| 5 | Physics allocation | Mutate in place | 1 hour | -4800 allocs/sec |
| 6 | Pop seededRandom | Inline hash | 30 min | Minor GC reduction |

---

## 8. Suggested Architecture (if refactoring)

```
BubbleScene
├── BubbleSpawner (no useFrame, just spawn logic)
├── BubbleInstancedRenderer
│   ├── 1x InstancedMesh (shared geo + shared material)
│   ├── 1x useFrame callback that:
│   │     1. Reads bubble Map directly (not via React state)
│   │     2. Runs physics for all bubbles
│   │     3. Updates instance matrices + colors
│   │     4. Handles expiry/pop detection
│   └── Per-instance attributes: color, opacity, scale
└── PopEffectRenderer (already efficient — single Points object)
```

This architecture would reduce the bubble rendering from O(N) draw calls + O(N) useFrame + O(N) React components to **O(1)** for all three.
