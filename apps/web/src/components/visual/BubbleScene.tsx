import { useCallback, useRef, useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { useBubbleStore } from '@/stores/bubble-store';
import { useUIStore } from '@/stores/ui-store';
import { isButtonBlowing } from './BubbleControls';
import { spawnBubble } from '@/lib/bubble-factory';
import { BubbleInstances } from './BubbleInstances';
import { PopEffectRenderer, usePopEffect } from './PopEffect';
import { SIZE_RADIUS } from '@/physics/bubblePhysics';

const HOLD_INTERVAL = 250;
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

/**
 * BubbleSpawner: pointer-hold spawning.
 * Does NOT subscribe to s.bubbles.
 */
const _raycaster = new THREE.Raycaster();

function BubbleSpawner() {
  const { camera, pointer } = useThree();
  const [holding, setHolding] = useState(false);
  const interactionMode = useUIStore((s) => s.interactionMode);

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
    _raycaster.setFromCamera(ptRef.current, camRef.current);
    const dir = _raycaster.ray.direction.clone().normalize();
    const camDist = camRef.current.position.length();
    const spawnDist = camDist * 0.5;
    const center = _raycaster.ray.origin.clone().addScaledVector(dir, spawnDist);

    const spread = 0.15;
    spawnBubble(
      center.x + (Math.random() - 0.5) * spread,
      center.y + (Math.random() - 0.5) * spread * 0.5,
      center.z + (Math.random() - 0.5) * spread,
      colorRef.current,
      scheduleExpiry,
    );
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

  // In pop mode, don't render the spawner plane so clicks pass through to bubbles
  if (interactionMode !== 'blow') return null;

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
 * BubbleRenderer: single InstancedMesh for all bubbles + pop effects.
 */
function BubbleRenderer() {
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

  return (
    <>
      <BubbleInstances onPop={handlePop} onExpire={handleExpire} />
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
