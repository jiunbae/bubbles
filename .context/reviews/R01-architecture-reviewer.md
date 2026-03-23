# R01 Architecture Review: Continuous Bubble Spawning Failure

## Files Analyzed

- `apps/web/src/components/visual/BubbleControls.tsx`
- `apps/web/src/components/visual/BubbleScene.tsx`
- `apps/web/src/components/visual/BubbleMesh.tsx`
- `apps/web/src/components/visual/VisualMode.tsx`
- `apps/web/src/stores/bubble-store.ts`
- `apps/web/src/hooks/useBubbles.ts`
- `apps/web/src/components/visual/PopEffect.tsx`
- `apps/web/src/physics/bubblePhysics.ts`

---

## Root Cause Diagnosis

The bug has **two independent causes** that compound each other. Neither is about shader compilation, event propagation, or R3F Canvas reconciler limitations.

### Cause 1: `BubbleScene` re-renders kill the `holding` interval

`BubbleScene` subscribes to the Zustand store reactively:

```tsx
// BubbleScene.tsx line 36
const bubbles = useBubbleStore((s) => s.bubbles);
```

It also manages a click-to-spawn system via React state:

```tsx
// BubbleScene.tsx line 41
const [holding, setHolding] = useState(false);
```

The spawn effect runs on `[holding, spawnAtPointer]`:

```tsx
// BubbleScene.tsx lines 83-88
useEffect(() => {
  if (!holding) return;
  spawnAtPointer();
  const id = window.setInterval(spawnAtPointer, HOLD_INTERVAL);
  return () => window.clearInterval(id);
}, [holding, spawnAtPointer]);
```

**The critical failure path:**
1. User holds down -> `holding` becomes `true` -> effect fires -> first bubble spawns -> `setInterval` starts.
2. `spawnAtPointer()` calls `useBubbleStore.getState().addBubble(bubble)`.
3. `addBubble` creates a **new `Map` object** (store line 17: `const next = new Map(state.bubbles)`).
4. Because `BubbleScene` subscribes to `s.bubbles`, it **re-renders**.
5. Re-render runs the cleanup function of the `useEffect`, which calls `clearInterval`.
6. After re-render, the effect fires again (dependency `[holding, spawnAtPointer]` -- `holding` is still `true`, and `spawnAtPointer` is stable via `useCallback([], ...)`).
7. So the effect re-fires, spawns one more bubble, creates a new interval...
8. ...which immediately triggers another store update, another re-render, another cleanup.

The net result: the interval **never actually ticks**. Each bubble spawn triggers a synchronous re-render that tears down and re-creates the interval before the 150ms elapses. You get roughly one bubble per React commit cycle (which at 60fps is ~16ms), but the rapid mount/unmount thrashing of the effect causes dropped spawns and inconsistent timing. In practice, with React 18 batching, the user typically sees only **1-3 bubbles** total because React may batch multiple setState calls and the interval gets cleared before it ever fires.

### Cause 2: `BubbleControls` (HTML overlay) spawning is independent but also suffers

`BubbleControls` avoids React state for the blowing flag (uses `useRef`), and its `setInterval` does work correctly in isolation. However, `BubbleControls.spawnBubble()` calls `useBubbleStore.getState().addBubble()` which still triggers the reactive subscription in `BubbleScene`, causing `BubbleScene` to re-render on every bubble addition. This re-render is expensive because:

- `useMemo(() => Array.from(bubbles.values()), [bubbles])` on line 103 re-creates the array every time.
- React reconciles the entire `{bubbleArray.map(...)}` list, mounting new `BubbleMesh` components.
- Each `BubbleMesh` creates a `new THREE.ShaderMaterial()` on mount (line 50).

While `BubbleControls`'s interval itself is NOT torn down by these re-renders (since it lives in a different component tree outside the Canvas), the rapid Zustand state changes can cause React to batch and defer updates, leading to perceived "only one bubble" if the store updates coalesce or if the `bubbles.size >= 50` guard trips due to stale size checks.

**However**, the primary user-facing bug is most likely from the `BubbleScene` code path (pointer-hold in the 3D scene), where the interval teardown cycle is fatal.

### Why the `BubbleControls` path may ALSO appear broken

Looking more carefully at `BubbleControls`, the `startBlowing` function is defined inside the component body but is **not wrapped in `useCallback`** and is **not stable across renders**. The `useEffect` for keyboard events captures `startBlowing` and `stopBlowing` by closure on the initial render. Since BubbleControls itself does NOT subscribe to any Zustand state reactively, it does NOT re-render when bubbles change, so the closures remain valid. The `setInterval` in `startBlowing` should work.

**Verdict: `BubbleControls` button/spacebar spawning likely DOES work for continuous spawning.** If the user reports it doesn't, there may be an additional issue such as:
- The `onMouseLeave` handler (line 116) firing unexpectedly due to cursor movement, killing the interval.
- Touch events on mobile causing immediate `touchend`.

The **primary broken path** is the `BubbleScene` pointer-hold mechanism.

---

## Architectural Assessment

### Current Architecture Problems

| Problem | Severity | Detail |
|---------|----------|--------|
| Reactive Zustand subscription in render loop component | **Critical** | `BubbleScene` subscribes to `s.bubbles`, causing re-render on every add/remove. This tears down the `holding` effect's interval. |
| `new Map()` on every mutation | Medium | Forces referential inequality on every store update, guaranteeing re-renders. |
| Individual `<mesh>` per bubble | Medium | Each bubble is a separate React element. Adding/removing triggers React reconciliation across the entire list. With 50 bubbles, this is ~50 fiber nodes being diffed. |
| `new THREE.ShaderMaterial()` per mount | Low | Three.js caches compiled shader programs, so the GPU program is reused. But JS object allocation per bubble is unnecessary overhead. |
| Duplicate spawn logic | Low | `BubbleControls`, `BubbleScene`, and `useBubbles.ts` all have their own `spawnBubble`/`createBubble` functions with duplicated `tint()`, `randSize()`, `makeId()`. |

### Should bubbles be individual React components or managed imperatively?

**Individual React components are fine at this scale** (max 50 bubbles). The R3F reconciler handles child additions/removals efficiently. The problem is not "too many React components" but rather "re-renders tear down unrelated effects."

For a production app with hundreds or thousands of bubbles, an `InstancedMesh` approach would be necessary. At 50 bubbles, individual meshes are acceptable.

### InstancedMesh vs individual meshes?

At 50 max bubbles, individual meshes are fine. `InstancedMesh` would reduce draw calls from 50 to 1, but adds complexity (manual attribute buffer management, no per-instance click handling via R3F, manual lifecycle tracking). Not worth it for the current cap.

### Should bubble state live in Zustand or in a plain JS array outside React?

**Zustand is appropriate**, but the subscription pattern must change. The store should hold the data, but the R3F render loop should read it non-reactively (via `getState()` or `useRef` + `subscribe`).

---

## Correct Architecture

The fix is straightforward: **decouple the spawn interval from reactive re-renders** by not letting `BubbleScene` re-render when bubbles change. Instead, read bubble state non-reactively in the render loop.

### Strategy

1. **Remove the reactive `useBubbleStore((s) => s.bubbles)` subscription from `BubbleScene`.**
2. **Use `useSyncExternalStore` or a `useRef` + `subscribe` pattern** to get bubble data without triggering React re-renders.
3. **Use `useFrame` to sync R3F scene children with the store** imperatively, OR use a stable reference that R3F can reconcile without tearing down effects.

The simplest correct fix: separate the spawning logic from the rendering logic so that the `holding` effect does not share a component with the reactive bubble list.

---

## Concrete Implementation Fix

### Fix 1 (Minimal, Targeted): Isolate the `holding` interval from re-renders

Extract the spawn-on-hold logic into a component that does NOT subscribe to `s.bubbles`:

**`BubbleScene.tsx` -- fixed version:**

```tsx
import { useCallback, useRef, useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { useBubbleStore } from '@/stores/bubble-store';
import { useUIStore } from '@/stores/ui-store';
import { BUBBLE_LIFETIME } from '@bubbles/shared';
import type { BubbleInfo, BubbleSize } from '@bubbles/shared';
import { BubbleMesh } from './BubbleMesh';
import { PopEffectRenderer, usePopEffect } from './PopEffect';
import { SIZE_RADIUS } from '@/physics/bubblePhysics';

const HOLD_INTERVAL = 150;
const MAX_BUBBLES = 50;
const _dir = new THREE.Vector3();
const _target = new THREE.Vector3();

const sharedGeo = new THREE.IcosahedronGeometry(1, 3);

let _c = 0;
function makeId() { return `s${Date.now()}_${++_c}`; }
function randSize(): BubbleSize {
  const r = Math.random();
  return r < 0.35 ? 'S' : r < 0.8 ? 'M' : 'L';
}
function tint(hex: string): string {
  try {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const v = (n: number) => Math.max(0, Math.min(255, n + Math.round((Math.random() - 0.5) * 60)));
    return `#${v(r).toString(16).padStart(2,'0')}${v(g).toString(16).padStart(2,'0')}${v(b).toString(16).padStart(2,'0')}`;
  } catch { return hex; }
}

/**
 * Spawner: handles pointer-hold spawning.
 * Does NOT subscribe to s.bubbles, so store mutations don't tear down the interval.
 */
function BubbleSpawner() {
  const { camera, raycaster, pointer } = useThree();
  const [holding, setHolding] = useState(false);

  const colorRef = useRef(useUIStore.getState().selectedColor);
  useEffect(() => useUIStore.subscribe((s) => { colorRef.current = s.selectedColor; }), []);

  const camRef = useRef(camera);
  const rcRef = useRef(raycaster);
  const ptRef = useRef(pointer);
  camRef.current = camera;
  rcRef.current = raycaster;
  ptRef.current = pointer;

  const spawnAtPointer = useCallback(() => {
    if (useBubbleStore.getState().bubbles.size >= MAX_BUBBLES) return;

    rcRef.current.setFromCamera(ptRef.current, camRef.current);
    _dir.copy(rcRef.current.ray.direction).normalize();
    _target.copy(rcRef.current.ray.origin).addScaledVector(_dir, 5);

    const size = randSize();
    const now = Date.now();
    const range = BUBBLE_LIFETIME[size];
    const lifetime = range.min + Math.random() * (range.max - range.min);
    const id = makeId();
    const c = tint(colorRef.current);
    const spread = 0.5;

    const bubble: BubbleInfo = {
      bubbleId: id,
      blownBy: { sessionId: 'local', displayName: 'You', isAuthenticated: false, color: c },
      x: _target.x + (Math.random() - 0.5) * spread,
      y: _target.y + (Math.random() - 0.5) * spread,
      z: _target.z + (Math.random() - 0.5) * spread,
      size, color: c, pattern: 'plain',
      seed: Math.random() * 10000,
      createdAt: now, expiresAt: now + lifetime,
    };

    useBubbleStore.getState().addBubble(bubble);
    setTimeout(() => useBubbleStore.getState().removeBubble(id), lifetime);
  }, []);

  // This effect is now stable: `holding` only changes on pointer events,
  // NOT on store updates, because this component doesn't subscribe to bubbles.
  useEffect(() => {
    if (!holding) return;
    spawnAtPointer();
    const id = window.setInterval(spawnAtPointer, HOLD_INTERVAL);
    return () => window.clearInterval(id);
  }, [holding, spawnAtPointer]);

  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, -0.5, 0]}
      onPointerDown={(e) => { e.stopPropagation(); setHolding(true); }}
      onPointerUp={() => setHolding(false)}
      onPointerLeave={() => setHolding(false)}
    >
      <planeGeometry args={[100, 100]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
  );
}

/**
 * BubbleRenderer: subscribes to bubbles and renders them.
 * Isolated from spawning logic so re-renders here don't affect the spawn interval.
 */
function BubbleRenderer() {
  const bubbles = useBubbleStore((s) => s.bubbles);
  const removeBubble = useBubbleStore((s) => s.removeBubble);
  const { pops, setPops, triggerPop } = usePopEffect();

  const handlePop = useCallback(
    (bubbleId: string, position: THREE.Vector3, color: THREE.Color, size: number) => {
      triggerPop(position, color, size);
      removeBubble(bubbleId);
    },
    [removeBubble, triggerPop],
  );

  const handleExpire = useCallback(
    (bubbleId: string) => { removeBubble(bubbleId); },
    [removeBubble],
  );

  const bubbleArray = useMemo(() => Array.from(bubbles.values()), [bubbles]);

  return (
    <>
      {bubbleArray.map((bubble) => (
        <BubbleMesh
          key={bubble.bubbleId}
          bubble={bubble}
          sharedGeometry={sharedGeo}
          onExpire={handleExpire}
          onPop={handlePop}
        />
      ))}
      <PopEffectRenderer pops={pops} setPops={setPops} />
    </>
  );
}

export function BubbleScene() {
  return (
    <group>
      <BubbleSpawner />
      <BubbleRenderer />
    </group>
  );
}
```

### Why This Fixes It

The key insight: **React re-renders are scoped to the component that subscribes to changed state.** By splitting `BubbleScene` into two sibling components:

- `BubbleSpawner` -- owns the `holding` state and the `setInterval`. Does NOT subscribe to `s.bubbles`. Store mutations do not cause it to re-render. The interval survives.
- `BubbleRenderer` -- subscribes to `s.bubbles` and re-renders when bubbles change. This is fine because it has no interval or effect that would be torn down.

The parent `BubbleScene` renders `<group>` with both children. It never re-renders because it subscribes to nothing.

### What does NOT need to change

- **`bubble-store.ts`**: The `new Map()` pattern is correct for Zustand immutable updates. No change needed.
- **`BubbleMesh.tsx`**: Individual components with `useFrame` are fine at 50 bubbles. No change needed.
- **`BubbleControls.tsx`**: Already uses refs to avoid re-render-driven teardowns. Works correctly for button/spacebar spawning.
- **`PopEffect.tsx`**: Independent concern, no issues.
- **`VisualMode.tsx`**: Just composition, no issues.

---

## Summary

| Aspect | Assessment |
|--------|-----------|
| **Root cause** | Single component (`BubbleScene`) both subscribes to `s.bubbles` reactively AND runs a spawn `setInterval` in a `useEffect`. Every spawn mutates the store, re-renders the component, tears down the interval, re-creates it -- the interval never ticks. |
| **Fix** | Split into `BubbleSpawner` (owns interval, no reactive subscription) and `BubbleRenderer` (subscribes to bubbles, renders meshes). Standard React composition pattern. |
| **Complexity** | Minimal. No new dependencies. No architectural overhaul. ~20 lines moved, zero logic changes. |
| **Risk** | Very low. Both sub-components are pure extractions of existing code. No behavioral change beyond fixing the bug. |
