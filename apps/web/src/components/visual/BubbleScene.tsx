import { useCallback, useRef, useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { useBubbleStore } from '@/stores/bubble-store';
import { useUIStore } from '@/stores/ui-store';
import { globalWsClient } from '@/lib/ws-client';
import { isButtonBlowing } from './BubbleControls';
import { BUBBLE_LIFETIME } from '@bubbles/shared';
import type { BubbleInfo, BubbleSize } from '@bubbles/shared';
import { BubbleMesh } from './BubbleMesh';
import { PopEffectRenderer, usePopEffect } from './PopEffect';
import { SIZE_RADIUS } from '@/physics/bubblePhysics';

const HOLD_INTERVAL = 250;
const BATCH_SIZE = 1; // 1 per tick — interval handles continuous flow
const MAX_BUBBLES = 80;

// ---------------------------------------------------------------------------
// Expiry timer manager – prevents setTimeout leaks on unmount / manual pop
// ---------------------------------------------------------------------------
const expiryTimers = new Map<string, ReturnType<typeof setTimeout>>();

function scheduleExpiry(bubbleId: string, delay: number) {
  const existing = expiryTimers.get(bubbleId);
  if (existing) clearTimeout(existing);

  const timer = setTimeout(() => {
    useBubbleStore.getState().removeBubble(bubbleId);
    expiryTimers.delete(bubbleId);
  }, delay);
  expiryTimers.set(bubbleId, timer);
}

function cancelExpiry(bubbleId: string) {
  const timer = expiryTimers.get(bubbleId);
  if (timer) {
    clearTimeout(timer);
    expiryTimers.delete(bubbleId);
  }
}

export { scheduleExpiry, cancelExpiry, expiryTimers };

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
    return `#${v(r).toString(16).padStart(2, '0')}${v(g).toString(16).padStart(2, '0')}${v(b).toString(16).padStart(2, '0')}`;
  } catch { return hex; }
}

function createBubbleAt(x: number, y: number, z: number, color: string): BubbleInfo {
  const size = randSize();
  const now = Date.now();
  const range = BUBBLE_LIFETIME[size];
  const lifetime = range.min + Math.random() * (range.max - range.min);
  const id = makeId();
  const c = tint(color);
  return {
    bubbleId: id,
    blownBy: { sessionId: 'local', displayName: 'You', isAuthenticated: false, color: c },
    x, y, z,
    size, color: c, pattern: 'plain',
    seed: Math.random() * 10000,
    createdAt: now, expiresAt: now + lifetime,
  };
}

/**
 * BubbleSpawner: pointer-hold spawning.
 * Does NOT subscribe to s.bubbles.
 */
function BubbleSpawner() {
  const { camera, pointer } = useThree();
  const [holding, setHolding] = useState(false);

  const colorRef = useRef(useUIStore.getState().selectedColor);
  useEffect(() => useUIStore.subscribe((s) => { colorRef.current = s.selectedColor; }), []);

  const camRef = useRef(camera);
  const ptRef = useRef(pointer);
  camRef.current = camera;
  ptRef.current = pointer;

  const spawnBatch = useCallback(() => {
    if (isButtonBlowing()) return; // button handles its own spawning
    const store = useBubbleStore.getState();
    if (store.bubbles.size >= MAX_BUBBLES) return;

    // Raycast from mouse into scene, place bubbles at halfway to origin
    const rc = new THREE.Raycaster();
    rc.setFromCamera(ptRef.current, camRef.current);
    const dir = rc.ray.direction.clone().normalize();
    const camDist = camRef.current.position.length(); // distance from origin
    const spawnDist = camDist * 0.5; // halfway between camera and origin
    const center = rc.ray.origin.clone().addScaledVector(dir, spawnDist);

    const count = BATCH_SIZE;
    for (let i = 0; i < count; i++) {
      const spread = 0.15;
      const bubble = createBubbleAt(
        center.x + (Math.random() - 0.5) * spread,
        center.y + (Math.random() - 0.5) * spread * 0.5,
        center.z + (Math.random() - 0.5) * spread,
        colorRef.current,
      );
      useBubbleStore.getState().addBubble(bubble);
      const lt = bubble.expiresAt - bubble.createdAt;
      scheduleExpiry(bubble.bubbleId, lt);

      // Send to server for other users
      if (globalWsClient.isConnected()) {
        globalWsClient.send({
          type: 'blow',
          data: { size: bubble.size, color: bubble.color, pattern: 'plain', x: bubble.x, y: bubble.y, z: bubble.z, seed: bubble.seed, expiresAt: bubble.expiresAt },
        });
      }
    }
  }, []);

  useEffect(() => {
    if (!holding) return;
    spawnBatch();
    const id = window.setInterval(spawnBatch, HOLD_INTERVAL);
    return () => window.clearInterval(id);
  }, [holding, spawnBatch]);

  // Global pointerup — immune to R3F synthetic events
  useEffect(() => {
    const onUp = () => setHolding(false);
    window.addEventListener('pointerup', onUp);
    return () => window.removeEventListener('pointerup', onUp);
  }, []);

  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, -1, 0]}
      onPointerDown={(e) => {
        // Only left click spawns bubbles (button 0)
        if (e.button !== 0) return;
        e.stopPropagation();
        setHolding(true);
      }}
    >
      {/* Large enough to always catch clicks regardless of zoom */}
      <planeGeometry args={[200, 200]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
  );
}

/**
 * BubbleRenderer: subscribes to bubbles and renders them.
 */
// ONE shared MeshStandardMaterial — compiled once, cloned per bubble (same shader program)
const sharedBubbleMaterial = new THREE.MeshStandardMaterial({
  metalness: 0.1,
  roughness: 0.1,
  transparent: true,
  opacity: 0.3,
  side: THREE.DoubleSide,
  depthWrite: false,
  emissive: new THREE.Color('#4488cc'),
  emissiveIntensity: 0.05,
});

function BubbleRenderer() {
  const bubbles = useBubbleStore((s) => s.bubbles);
  const removeBubble = useBubbleStore((s) => s.removeBubble);
  const pendingPops = useBubbleStore((s) => s.pendingPops);
  const clearPendingPops = useBubbleStore((s) => s.clearPendingPops);
  const { pops, setPops, triggerPop } = usePopEffect();

  // Process pending pops from other users (WebSocket)
  useEffect(() => {
    if (pendingPops.length === 0) return;
    for (const pp of pendingPops) {
      triggerPop(
        new THREE.Vector3(pp.x, pp.y, pp.z),
        new THREE.Color(pp.color),
        SIZE_RADIUS[pp.size] * 0.5,
      );
    }
    clearPendingPops();
  }, [pendingPops, clearPendingPops, triggerPop]);

  const handlePop = useCallback(
    (bubbleId: string, position: THREE.Vector3, color: THREE.Color, size: number) => {
      cancelExpiry(bubbleId);
      triggerPop(position, color, size);
      removeBubble(bubbleId);
    },
    [removeBubble, triggerPop],
  );

  const handleExpire = useCallback(
    (bubbleId: string) => {
      const b = useBubbleStore.getState().bubbles.get(bubbleId);
      if (b) {
        triggerPop(
          new THREE.Vector3(b.x, b.y, b.z),
          new THREE.Color(b.color),
          SIZE_RADIUS[b.size] * 0.5,
        );
      }
      removeBubble(bubbleId);
    },
    [removeBubble, triggerPop],
  );

  const bubbleArray = useMemo(() => Array.from(bubbles.values()), [bubbles]);

  return (
    <>
      {bubbleArray.map((bubble) => (
        <BubbleMesh
          key={bubble.bubbleId}
          bubble={bubble}
          sharedGeometry={sharedGeo}
          sharedMaterial={sharedBubbleMaterial}
          onExpire={handleExpire}
          onPop={handlePop}
        />
      ))}
      <PopEffectRenderer pops={pops} setPops={setPops} />
    </>
  );
}

export function BubbleScene() {
  // Clear all expiry timers on unmount to prevent leaked timeouts
  useEffect(() => {
    return () => {
      for (const timer of expiryTimers.values()) clearTimeout(timer);
      expiryTimers.clear();
    };
  }, []);

  return (
    <group>
      <BubbleSpawner />
      <BubbleRenderer />
    </group>
  );
}
