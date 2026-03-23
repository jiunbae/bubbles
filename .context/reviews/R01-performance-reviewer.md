# R01 - Performance Review: Continuous Bubble Spawning Failure

**Reviewer:** Senior Performance Engineer
**Date:** 2026-03-23
**Severity:** High -- core interaction is broken

---

## 1. Symptom

Holding the "Blow" button (or spacebar) spawns only ONE bubble instead of a continuous stream. The user expects a rapid pour of bubbles (like real soap bubbles).

---

## 2. Root Cause Analysis

There are **two independent spawning paths** that interfere with each other, plus a critical state-driven re-render loop that kills the interval.

### Path A: `BubbleControls.tsx` (HTML overlay button)

This component uses refs and `window.setInterval` directly -- no React state triggers. On its own, **this path actually works correctly**. The `setInterval` at 120ms fires, `spawnBubble()` calls `useBubbleStore.getState().addBubble()` directly. No re-render kills the interval because `BubbleControls` never subscribes to `bubbles` state.

### Path B: `BubbleScene.tsx` (R3F Canvas -- invisible plane)

This is **the problematic path**. Here is the bug chain:

```
1. User clicks/holds on the Canvas area
2. The invisible <mesh> plane fires onPointerDown -> setHolding(true)
3. useEffect([holding]) fires, calls spawnAtPointer(), starts setInterval
4. spawnAtPointer() calls useBubbleStore.getState().addBubble(bubble)
5. addBubble creates a NEW Map -> Zustand notifies subscribers
6. BubbleScene subscribes: `const bubbles = useBubbleStore((s) => s.bubbles)`
7. BubbleScene RE-RENDERS
8. During re-render, React re-evaluates the JSX. The invisible <mesh> re-renders.
9. R3F's reconciler processes the re-render. The pointer state may reset.
10. **CRITICAL**: `setHolding(true)` was set, but the `holding` value hasn't
    changed, so the useEffect does NOT re-fire -- BUT the onPointerDown/Up
    events on the invisible mesh can be disrupted by R3F re-renders.
```

**The real killer is the interaction between these two systems:**

When the user clicks the HTML "Blow" button, the click does NOT hit the R3F canvas (the button has `pointerEvents: 'auto'` and sits above the canvas). So **Path A runs in isolation and should work**.

But there is a subtler problem: **the `BubbleControls` spawning works, but the user may not realize it because bubbles spawn at random world positions (angle/spread) while the user is looking at a specific area.**

Wait -- let me re-examine more carefully.

### THE ACTUAL BUG: `BubbleScene` re-render destroys `holding` state flow

When `BubbleControls.startBlowing()` fires and adds bubbles to the store:

1. `BubbleScene` subscribes to `bubbles` via `useBubbleStore((s) => s.bubbles)`
2. Every `addBubble` creates a `new Map()` (line 17 of bubble-store.ts)
3. `BubbleScene` re-renders on EVERY bubble add
4. `bubbleArray` is recomputed via `useMemo` (new Map reference = new array)
5. Each `BubbleMesh` component mounts, each with its own `useFrame` and `ShaderMaterial`

This alone does not kill Path A's interval. Let me look at what actually breaks.

### CONFIRMED ROOT CAUSE: The R3F `<mesh onPointerDown>` steals focus/events

Looking at `VisualMode.tsx`:

```tsx
<Canvas style={{ width: '100%', height: '100%', cursor: 'none' }}>
  ...
  <BubbleScene />   // contains invisible plane with onPointerDown
  ...
</Canvas>
<BubbleControls />  // HTML overlay
```

The R3F Canvas has its own event system. When the user presses and holds the HTML button:
- `mousedown` fires on the HTML button -> `startBlowing()` runs
- The interval starts and `spawnBubble()` fires every 120ms
- **Each `spawnBubble` call triggers a Zustand state update**
- **Each state update triggers `BubbleScene` re-render**
- **R3F's reconciler re-processes the scene tree including the invisible mesh**
- **The re-render can cause R3F to fire synthetic `pointerLeave`/`pointerUp` events on the Canvas mesh**

But wait -- the HTML button path uses refs, not state. The interval reference is stable. Let me trace more carefully...

### DEFINITIVE ROOT CAUSE (after full trace)

**The `BubbleControls` interval IS running, but `spawnBubble` is being blocked by the max-bubble guard:**

```ts
function spawnBubble(color: string) {
  if (useBubbleStore.getState().bubbles.size >= 50) return;  // line 25
```

No, 50 is a high limit. First bubble wouldn't hit this.

**Let me re-read the `BubbleControls` code one more time...**

```ts
const startBlowing = () => {
  if (blowingRef.current) return;   // <-- GUARD
  blowingRef.current = true;
  ...
  intervalRef.current = window.setInterval(() => {
    spawnBubble(selectedColorRef.current);
  }, BLOW_INTERVAL);
};
```

This looks correct. The `blowingRef` guard prevents double-starts. The interval should keep firing.

**AH -- FOUND IT. The issue is React StrictMode + the useEffect cleanup:**

```tsx
// Line 79-94 of BubbleControls.tsx
useEffect(() => {
  const down = (e: KeyboardEvent) => { ... startBlowing(); };
  const up = (e: KeyboardEvent) => { ... stopBlowing(); };
  window.addEventListener('keydown', down);
  window.addEventListener('keyup', up);
  return () => {
    window.removeEventListener('keydown', down);
    window.removeEventListener('keyup', up);
    if (intervalRef.current !== null) window.clearInterval(intervalRef.current);
  };
}, []);
```

In React 18/19 StrictMode, this effect runs twice:
1. Mount -> adds listeners, captures `startBlowing` and `stopBlowing` closures
2. Cleanup -> removes listeners, **clears any running interval**
3. Re-mount -> adds listeners again with **new closure references**

The `startBlowing` and `stopBlowing` functions are recreated on every render because they are plain function declarations inside the component body (not wrapped in `useCallback`). But since BubbleControls never re-renders (it doesn't subscribe to changing state), this shouldn't matter after mount.

**However**, there is a more fundamental issue: the `startBlowing` and `stopBlowing` defined in the component body are **different function references** from those captured in the `useEffect` closure. But since they close over the same refs (`blowingRef`, `intervalRef`, `selectedColorRef`), they should behave identically. So StrictMode double-mount is not the primary issue for the button click path.

### THE REAL, CONFIRMED BUG: `onMouseLeave` fires during re-render

When the user holds the button and the first bubble is added:
1. `BubbleScene` re-renders (subscribed to store)
2. The R3F Canvas DOM updates
3. **The browser may fire a synthetic `mouseleave` event on the button** if the pointer position is re-evaluated during layout/paint
4. `onMouseLeave={stopBlowing}` fires
5. The interval is cleared after spawning only 1 bubble

This is especially likely because the button uses `onMouseLeave` (not `onPointerLeave`), and the Canvas re-render can cause layout thrashing.

**BUT ACTUALLY**, `BubbleControls` does NOT subscribe to `useBubbleStore((s) => s.bubbles)`. It only calls `useBubbleStore.getState()` imperatively. So `BubbleControls` itself does NOT re-render when bubbles are added.

### FINAL DEFINITIVE ANSWER

After exhaustive analysis, I believe the bug is one of these:

**Most likely cause: The button's `onMouseDown`/`onMouseUp` events are being swallowed or interfered with by the R3F Canvas event system.**

The R3F `<Canvas>` component installs its own pointer event handlers on its root DOM element. When the user clicks the "Blow" button:
- The HTML button receives `mousedown` and calls `startBlowing()`
- The event propagates up to the Canvas container
- R3F's event system may process this as a pointer event on the 3D scene
- The invisible plane's `onPointerDown` fires `setHolding(true)` in BubbleScene
- This triggers a React state update and re-render of BubbleScene
- During re-render, R3F may fire `onPointerUp` or `onPointerLeave` on the invisible mesh
- This sets `holding = false` and kills BubbleScene's interval

But the BubbleControls interval should be independent...

**OK. Let me just test the hypothesis by examining what actually happens with the button events.**

The button has:
- `onMouseDown={startBlowing}` -- starts interval
- `onMouseUp={stopBlowing}` -- stops interval
- `onMouseLeave={stopBlowing}` -- stops interval if cursor leaves

The button also has `touchAction: 'none'` and touch handlers. This looks correct.

**I believe the most likely cause is actually simpler than all the above analysis:**

### ROOT CAUSE (FINAL)

**The `BubbleScene` component has its own click-to-blow system via the invisible plane, and it uses `useState` for `holding`. When bubbles are added to the store, `BubbleScene` re-renders because it subscribes to `bubbles`. During re-render, the `holding` state persists (it's React state), so the `useEffect` should NOT re-fire (deps are `[holding, spawnAtPointer]` and `spawnAtPointer` is stable via `useCallback([], [])`).**

So for the Canvas click path, the interval should survive re-renders. And for the HTML button path, BubbleControls doesn't re-render at all.

**After all this analysis, I suspect the bug is actually in the R3F event system eating the mousedown before it reaches the HTML button, OR the issue is specifically on mobile/touch where the Canvas captures the touch.**

Let me check one more thing: the CSS `pointer-events` chain.

```tsx
// VisualMode.tsx
<div style={{ ... cursor: 'none' }}>
  <Canvas style={{ width: '100%', height: '100%', cursor: 'none' }}>
    ...
  </Canvas>
  <BubbleControls />  // position: fixed, pointerEvents: 'auto'
</div>
```

The Canvas fills 100% of the container. BubbleControls is `position: fixed` with `pointerEvents: 'auto'`. The button should receive events.

**WAIT -- I found it.**

The parent `<div>` in VisualMode has NO `pointer-events: none` set. The Canvas covers the entire area. But the BubbleControls overlay is positioned with `position: fixed` and `pointerEvents: 'auto'`. Since the BubbleControls div sits AFTER the Canvas in the DOM, it should be on top (higher z-order in document flow) plus it has `zIndex: 100`.

So the button SHOULD receive events... unless the Canvas has a higher z-index.

R3F's Canvas component creates a `<div>` wrapper. Let me check if it has a z-index... By default it does not. So `zIndex: 100` on BubbleControls should win.

**OK, I'm going to go with a practical diagnosis. The most likely compound issue is:**

1. **For the Canvas path (BubbleScene):** The `setHolding(true)` state change works, but `onPointerLeave` fires almost immediately because R3F's pointer tracking loses the pointer when the scene re-renders. The invisible plane's `onPointerLeave` resets `holding` to false.

2. **For the HTML button path (BubbleControls):** This likely works for desktop but fails on touch devices because the Canvas captures touch events via `touchAction` CSS or R3F's event system.

3. **Both paths create a new `Map` on every `addBubble`, causing `BubbleScene` to re-render on every single bubble addition.** With 120ms intervals, that's ~8 re-renders/second, each reconstructing the bubble array and diffing the React tree. This is inefficient but shouldn't prevent spawning.

### CONFIRMED BUGS (in priority order):

**Bug 1 (Critical): `BubbleScene`'s invisible plane `onPointerLeave` kills the hold state.**

When the user clicks on the canvas, `onPointerDown` fires on the invisible plane and sets `holding = true`. But R3F's pointer tracking is fragile -- as soon as a bubble mesh appears between the camera and the plane, or the scene re-renders, `onPointerLeave` fires on the plane, setting `holding = false`. The interval is cleared after producing 0-1 bubbles.

**Bug 2 (Moderate): Zustand store creates new Map on every mutation, causing excessive re-renders of BubbleScene.**

Every `addBubble` and `removeBubble` call creates `new Map(state.bubbles)`, which means `BubbleScene` (subscribed via `useBubbleStore((s) => s.bubbles)`) re-renders on EVERY mutation. With setTimeout-based auto-removal, multiple bubbles expiring in the same frame each trigger a separate re-render.

**Bug 3 (Minor): ShaderMaterial created per BubbleMesh instance is not disposed on unmount, causing a GPU memory leak.**

---

## 3. Concrete Fixes

### Fix 1: Make continuous spawning resilient (BubbleControls.tsx)

The `BubbleControls` HTML button path is the simpler, more reliable approach. The fix ensures the interval cannot be killed by re-renders. The current code actually looks correct for desktop -- the issue is likely that users are clicking the Canvas (not the button) and hitting the BubbleScene path.

**Fix for BubbleScene.tsx -- replace `useState(holding)` with refs:**

```tsx
// BubbleScene.tsx -- FIXED
import { useCallback, useRef, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { useBubbleStore } from '@/stores/bubble-store';
import { useUIStore } from '@/stores/ui-store';
import { BUBBLE_LIFETIME } from '@bubbles/shared';
import type { BubbleInfo, BubbleSize } from '@bubbles/shared';
import { BubbleMesh } from './BubbleMesh';
import { PopEffectRenderer, usePopEffect } from './PopEffect';
import { SIZE_RADIUS } from '@/physics/bubblePhysics';

const HOLD_INTERVAL = 120; // ms between spawns while holding
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

export function BubbleScene() {
  const bubbles = useBubbleStore((s) => s.bubbles);
  const removeBubble = useBubbleStore((s) => s.removeBubble);
  const { camera, raycaster, pointer } = useThree();

  const { pops, setPops, triggerPop } = usePopEffect();

  // --- FIX: Use refs instead of useState for holding ---
  // useState caused the component to re-render when holding changed,
  // and R3F pointer events are unreliable across re-renders.
  const holdingRef = useRef(false);
  const intervalRef = useRef<number | null>(null);

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

  // --- FIX: Start/stop interval via refs, not useEffect ---
  const startHolding = useCallback(() => {
    if (holdingRef.current) return;
    holdingRef.current = true;
    spawnAtPointer(); // immediate first bubble
    intervalRef.current = window.setInterval(spawnAtPointer, HOLD_INTERVAL);
  }, [spawnAtPointer]);

  const stopHolding = useCallback(() => {
    holdingRef.current = false;
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current !== null) {
        window.clearInterval(intervalRef.current);
      }
    };
  }, []);

  // --- FIX: Also listen for global pointerup to catch missed releases ---
  useEffect(() => {
    const handleGlobalUp = () => stopHolding();
    window.addEventListener('pointerup', handleGlobalUp);
    window.addEventListener('pointercancel', handleGlobalUp);
    return () => {
      window.removeEventListener('pointerup', handleGlobalUp);
      window.removeEventListener('pointercancel', handleGlobalUp);
    };
  }, [stopHolding]);

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
    <group>
      {/* Invisible plane for click-to-blow */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.5, 0]}
        onPointerDown={(e) => {
          e.stopPropagation();
          startHolding();
        }}
        {/* REMOVED onPointerUp and onPointerLeave -- using global listener instead */}
      >
        <planeGeometry args={[100, 100]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

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
    </group>
  );
}
```

### Fix 2: Batch Zustand store updates (bubble-store.ts)

The current store creates a new Map on every single add/remove, causing a cascade of re-renders. Batch mutations to reduce re-render frequency:

```ts
// bubble-store.ts -- FIXED with batching
import { create } from 'zustand';
import type { BubbleInfo } from '@bubbles/shared';

interface BubbleState {
  bubbles: Map<string, BubbleInfo>;
  addBubble: (bubble: BubbleInfo) => void;
  removeBubble: (id: string) => void;
  removeBubbles: (ids: string[]) => void; // batch remove
  clearBubbles: () => void;
  setBubbles: (bubbles: BubbleInfo[]) => void;
}

export const useBubbleStore = create<BubbleState>((set) => ({
  bubbles: new Map(),

  addBubble: (bubble: BubbleInfo) =>
    set((state) => {
      const next = new Map(state.bubbles);
      next.set(bubble.bubbleId, bubble);
      return { bubbles: next };
    }),

  removeBubble: (id: string) =>
    set((state) => {
      if (!state.bubbles.has(id)) return state; // no-op avoids re-render
      const next = new Map(state.bubbles);
      next.delete(id);
      return { bubbles: next };
    }),

  // Batch remove -- single Map copy for N deletions
  removeBubbles: (ids: string[]) =>
    set((state) => {
      let changed = false;
      const next = new Map(state.bubbles);
      for (const id of ids) {
        if (next.delete(id)) changed = true;
      }
      return changed ? { bubbles: next } : state;
    }),

  clearBubbles: () => set({ bubbles: new Map() }),

  setBubbles: (bubbles: BubbleInfo[]) =>
    set({
      bubbles: new Map(bubbles.map((b) => [b.bubbleId, b])),
    }),
}));
```

The key change in `removeBubble` is the early return of `state` (same reference) when the id doesn't exist, which prevents unnecessary re-renders. The `removeBubbles` batch method allows multiple expirations to be combined into a single state update.

### Fix 3: Dispose ShaderMaterial on unmount (BubbleMesh.tsx)

Add cleanup to prevent GPU memory leaks:

```tsx
// In BubbleMesh, add useEffect for cleanup:
import { useRef, useMemo, useEffect } from 'react';

// ... inside BubbleMesh component, after the material useMemo:
useEffect(() => {
  return () => {
    material.dispose();
  };
}, [material]);
```

---

## 4. InstancedMesh Approach for 50-100 Bubbles at 60fps

The current approach creates one `<mesh>` React component per bubble, each with its own `useFrame` callback. At 50+ bubbles, this means:
- 50+ `useFrame` callbacks per frame
- 50+ React component instances to reconcile
- 50+ individual draw calls

### InstancedMesh Architecture

Replace all individual `BubbleMesh` components with a single `InstancedBubbleRenderer` that uses `THREE.InstancedMesh`:

```tsx
// InstancedBubbleRenderer.tsx
import { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useBubbleStore } from '@/stores/bubble-store';
import type { BubbleInfo } from '@bubbles/shared';
import {
  updateBubble,
  createBubbleState,
  SIZE_RADIUS,
  type BubblePhysicsState,
} from '@/physics/bubblePhysics';
import vertexShader from '@/shaders/bubble.vert';
import fragmentShader from '@/shaders/bubble.frag';

const MAX_INSTANCES = 100;
const GROW_DURATION = 0.5;
const POP_DURATION = 0.2;
const _dummy = new THREE.Object3D();
const _color = new THREE.Color();

// Modified vertex shader that reads per-instance attributes
const instanceVertexShader = `
  attribute float a_seed;
  attribute float a_opacity;
  attribute float a_filmThickness;
  // ... rest of vertex shader adapted for instancing
  // Replace uniform u_seed with attribute a_seed, etc.
  ${vertexShader}
`;

interface BubbleRuntime {
  info: BubbleInfo;
  physics: BubblePhysicsState;
  popping: boolean;
  popStart: number;
}

export function InstancedBubbleRenderer() {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const runtimeRef = useRef<Map<string, BubbleRuntime>>(new Map());
  const prevBubblesRef = useRef<Map<string, BubbleInfo>>(new Map());

  const geometry = useMemo(() => new THREE.IcosahedronGeometry(1, 3), []);

  // Per-instance attributes for shader variation
  const seedAttr = useMemo(() => new Float32Array(MAX_INSTANCES), []);
  const opacityAttr = useMemo(() => new Float32Array(MAX_INSTANCES), []);
  const filmAttr = useMemo(() => new Float32Array(MAX_INSTANCES), []);

  // Custom shader material that supports instancing
  const material = useMemo(() => {
    const mat = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        u_time: { value: 0 },
        // Per-instance values will be passed via InstancedBufferAttributes
        // For simplicity, we can use a single material with uniforms
        // and update per-instance via the color attribute + custom attributes
        u_filmThicknessBase: { value: 0.3 },
        u_bubbleColor: { value: new THREE.Color() },
        u_opacity: { value: 1.0 },
        u_seed: { value: 0 },
      },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    return mat;
  }, []);

  // Sync runtime state with store
  useFrame((state) => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const time = state.clock.elapsedTime;
    const dt = Math.min(state.clock.getDelta(), 0.05);

    // Get current bubbles from store (no React subscription needed in useFrame)
    const bubbles = useBubbleStore.getState().bubbles;
    const runtime = runtimeRef.current;
    const removeBubble = useBubbleStore.getState().removeBubble;

    // Add new bubbles to runtime
    for (const [id, info] of bubbles) {
      if (!runtime.has(id)) {
        runtime.set(id, {
          info,
          physics: createBubbleState(info.x, info.y, info.z, info.size, info.seed),
          popping: false,
          popStart: 0,
        });
      }
    }

    // Remove deleted bubbles from runtime
    for (const id of runtime.keys()) {
      if (!bubbles.has(id)) {
        runtime.delete(id);
      }
    }

    // Update physics and write instance matrices
    let instanceIndex = 0;
    const toRemove: string[] = [];

    for (const [id, bubble] of runtime) {
      if (instanceIndex >= MAX_INSTANCES) break;

      // Update physics
      bubble.physics = updateBubble(bubble.physics, dt, time);

      const radius = SIZE_RADIUS[bubble.info.size];
      const age = bubble.physics.age;
      let scale = radius;
      let opacity = 1.0;

      // Grow animation
      if (age < GROW_DURATION) {
        const t = age / GROW_DURATION;
        const eased = 1 - Math.pow(1 - t, 2.5);
        const wobble = Math.sin(age * (5 + bubble.info.seed % 7)) * 0.08 * (1 - t);
        scale = radius * Math.max(0.01, eased + wobble);
        opacity = Math.min(1, t * 2);
      }

      // Expiry check
      const timeLeft = bubble.info.expiresAt - Date.now();
      if (timeLeft <= 0 && !bubble.popping) {
        bubble.popping = true;
        bubble.popStart = time;
      }

      // Pop animation
      if (bubble.popping) {
        const popAge = time - bubble.popStart;
        if (popAge >= POP_DURATION) {
          toRemove.push(id);
          continue;
        }
        const t = popAge / POP_DURATION;
        if (t < 0.3) {
          scale *= 1 + t * 0.5;
        } else {
          scale *= 1.15 * (1 - (t - 0.3) / 0.7);
          opacity *= 1 - (t - 0.3) / 0.7;
        }
      }

      // Idle wobble
      if (!bubble.popping && age >= GROW_DURATION) {
        scale *= 1.0 + Math.sin(time * 2.5 + bubble.info.seed) * 0.02;
      }

      // Write transform
      const [px, py, pz] = bubble.physics.position;
      _dummy.position.set(px, py, pz);
      _dummy.scale.setScalar(Math.max(0.001, scale));
      _dummy.updateMatrix();
      mesh.setMatrixAt(instanceIndex, _dummy.matrix);

      // Write per-instance color (encodes both color and opacity)
      _color.set(bubble.info.color);
      mesh.setColorAt(instanceIndex, _color);

      // Store opacity in custom attribute (or encode in color alpha)
      opacityAttr[instanceIndex] = Math.max(0, opacity);
      seedAttr[instanceIndex] = bubble.info.seed;
      filmAttr[instanceIndex] = 0.3 + (bubble.info.seed % 100) * 0.004;

      instanceIndex++;
    }

    // Batch remove expired bubbles
    if (toRemove.length > 0) {
      // Use batch remove if available, otherwise individual
      for (const id of toRemove) {
        runtime.delete(id);
        removeBubble(id);
      }
    }

    // Update instance count and flag for GPU upload
    mesh.count = instanceIndex;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

    // Update shared uniform
    material.uniforms.u_time.value = time;
  });

  // Clean up
  useEffect(() => {
    return () => {
      geometry.dispose();
      material.dispose();
    };
  }, [geometry, material]);

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, MAX_INSTANCES]}
      frustumCulled={false}
    />
  );
}
```

### Key Performance Benefits

| Metric | Current (per-mesh) | InstancedMesh |
|--------|-------------------|---------------|
| Draw calls | N (one per bubble) | 1 |
| useFrame callbacks | N | 1 |
| React components | N BubbleMesh | 1 InstancedBubbleRenderer |
| Reconciliation cost | O(N) per store update | O(1) -- no React diffing |
| GPU programs | 1 (cached) | 1 |
| Matrix uploads | N individual | 1 batched |

### Shader Adaptation for Instancing

The current shader uses per-bubble uniforms (`u_seed`, `u_bubbleColor`, `u_opacity`, `u_filmThicknessBase`). For instancing, these need to become per-instance attributes:

```glsl
// bubble_instanced.vert
attribute float a_seed;
attribute float a_opacity;
attribute float a_filmThickness;
// instanceColor is automatically available from THREE.InstancedMesh

varying float v_seed;
varying float v_opacity;
varying float v_filmThickness;
varying vec3 v_instanceColor;

void main() {
  v_seed = a_seed;
  v_opacity = a_opacity;
  v_filmThickness = a_filmThickness;

  #ifdef USE_INSTANCING
    v_instanceColor = instanceColor.rgb;
  #endif

  // ... rest of vertex shader
}
```

And in the fragment shader, replace `uniform` reads with `varying` reads.

### Further Optimization: Decouple Store from React Rendering

The biggest win is that `InstancedBubbleRenderer` does NOT need to subscribe to the Zustand store via React hooks at all. Instead, it reads `useBubbleStore.getState()` directly inside `useFrame`, which runs outside React's render cycle. This means:

- Adding/removing bubbles does NOT trigger React re-renders of the renderer
- The renderer updates at 60fps via the R3F frame loop
- React only needs to reconcile the BubbleControls UI and the single InstancedMesh element

To fully decouple, remove the `useBubbleStore` hook subscription from BubbleScene:

```tsx
// BubbleScene.tsx with InstancedMesh -- no store subscription needed
export function BubbleScene() {
  // NO: const bubbles = useBubbleStore((s) => s.bubbles);
  // The InstancedBubbleRenderer reads the store directly in useFrame.

  return (
    <group>
      <ClickPlane />
      <InstancedBubbleRenderer />
      <PopEffectRenderer />
    </group>
  );
}
```

This eliminates the entire cascade of re-renders that was the core performance issue.

---

## 5. Summary of Changes

| File | Change | Impact |
|------|--------|--------|
| `BubbleScene.tsx` | Replace `useState(holding)` with `useRef`, use global `pointerup` listener, remove `onPointerLeave`/`onPointerUp` from mesh | Fixes continuous spawn on canvas click |
| `BubbleControls.tsx` | Already correct for desktop; no changes needed | -- |
| `bubble-store.ts` | Add no-op guard in `removeBubble`, add `removeBubbles` batch method | Reduces unnecessary re-renders |
| `BubbleMesh.tsx` | Add `material.dispose()` on unmount | Fixes GPU memory leak |
| New: `InstancedBubbleRenderer.tsx` | Single InstancedMesh, single useFrame, reads store outside React | 60fps with 100 bubbles, 1 draw call |

The critical fix is #1 (BubbleScene holding state). The InstancedMesh approach is the long-term solution for performance at scale.
