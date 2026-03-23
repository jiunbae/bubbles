# R02 — Full Pipeline Audit: "Only One Bubble Visible"

## Root Cause

**`state.clock.getDelta()` is called per-BubbleMesh, but it is a shared singleton.**

File: `apps/web/src/components/visual/BubbleMesh.tsx`, line 81:

```typescript
const dt = Math.min(state.clock.getDelta(), 0.05);
```

`THREE.Clock.getDelta()` returns the elapsed time since the **last call to `getDelta()`**. In React Three Fiber, `state.clock` is a single shared `THREE.Clock` instance. When `useFrame` fires, R3F calls every registered callback in order — one per `BubbleMesh`. So:

| BubbleMesh # | `getDelta()` returns | Effect |
|---|---|---|
| 1st | ~0.016 (correct) | Normal physics, grows, moves |
| 2nd | ~0.0001 (near zero) | `age` barely increments, scale stays at 0.01 |
| 3rd | ~0.00001 | Same — invisible |
| ... | ~0 | Same — invisible |

### Why this makes bubbles invisible

With `dt ≈ 0`:
1. `updateBubble()` adds essentially zero to `age` → age stays ≈ 0
2. Growth animation (line 99-105): at `age ≈ 0`, `t = age / GROW_DURATION ≈ 0`, so `eased ≈ 0`, `wobble ≈ 0`
3. `scale = radius * Math.max(0.01, 0 + 0) = radius * 0.01`
4. For a medium bubble: `0.8 * 0.01 = 0.008` — an 8-millimeter sphere at world scale
5. `opacity = 0.5 * Math.min(1, 0 * 3) = 0` — fully transparent

So all bubbles except the first are both **microscopic** and **fully transparent**. The first bubble works fine because it's the first `useFrame` subscriber to call `getDelta()` each frame and gets the real delta.

### Why the store counter is correct

The Zustand store is fine. `addBubble` creates `new Map(state.bubbles)` which produces a new reference each time. `useBubbleStore((s) => s.bubbles)` detects the new Map reference via `Object.is`. `useMemo(() => Array.from(bubbles.values()), [bubbles])` correctly recomputes. React does render N `<BubbleMesh>` components with unique keys and different props. The bug is purely in the per-frame physics update.

## The Fix

Replace `state.clock.getDelta()` with R3F's frame delta, which is provided as the second argument to the `useFrame` callback:

```typescript
// BEFORE (line 76-81):
useFrame((state) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const time = state.clock.elapsedTime;
    const dt = Math.min(state.clock.getDelta(), 0.05);

// AFTER:
useFrame((state, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const time = state.clock.elapsedTime;
    const dt = Math.min(delta, 0.05);
```

R3F computes `delta` once per frame and passes the same value to every `useFrame` callback. This is the idiomatic way to get frame delta in R3F.

**Note:** `state.clock.elapsedTime` is safe — it's a simple property read, not a mutating call. Only `getDelta()` has the singleton-mutation problem.

## Secondary Observations (not bugs, but worth noting)

### 1. Dual spawn paths
Both `BubbleControls.tsx` (via `spawnBatch`) and `BubbleScene.tsx` (via `BubbleSpawner`) can create bubbles. The HTML button uses `BubbleControls`, while clicking/holding on the 3D canvas uses `BubbleSpawner`. They share the same store but have independent ID counters (`_counter` vs `_c`), so no collision risk. Not a bug, but worth unifying.

### 2. Physics `isDead` flag is checked but never acted on
In `BubbleMesh.tsx`, the `isDead` flag from `updateBubble` is never checked. Dead bubbles continue rendering until their `setTimeout` fires. This is harmless since the timeout handles removal, but it means the stochastic early-pop logic in `shouldNaturallyPop` (line 248-266 of bubblePhysics.ts) has no visual effect — bubbles won't pop early even if `isDead` returns true.

### 3. Module-level shared `_pos` vector in BubbleMesh.tsx
`const _pos = new THREE.Vector3()` (line 26) is shared across all BubbleMesh instances. It's only used in `handleClick` which is synchronous and clones immediately (`.clone()`), so it's safe. But it's fragile.

### 4. Camera frustum coverage
Camera at `[0, 2, 8]` with FOV 50 looking at origin. Bubbles spawn at `x: cos(angle)*spread` (range ~[-1.5, 1.5]), `y: 0.5 to 2.0`, `z: sin(angle)*spread` (range ~[-1.5, 1.5]). These are well within the frustum. No issue here.

### 5. Material visibility
`opacity: 0.5`, `transparent: true`, `emissive` set with intensity 0.15, `side: DoubleSide`. Material is correctly visible. `depthWrite: false` is correct for transparent objects.

## Summary

| Aspect | Status |
|---|---|
| Store (bubble-store.ts) | OK — new Map reference on each mutation |
| Subscriber (BubbleRenderer) | OK — useMemo with bubbles dep |
| Spawn positions (BubbleControls) | OK — varied x/y/z within camera view |
| Spawn data (seeds, IDs) | OK — unique per bubble |
| Geometry sharing | OK — single `sharedGeo` instance |
| Material | OK — visible opacity, emissive glow |
| **useFrame delta** | **BUG — getDelta() is per-call, not per-frame** |
| Physics engine | OK — correct integration given correct dt |
| Camera setup | OK — position [0,2,8], FOV 50 |
