import { useRef, useMemo, useState } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { globalWsClient } from '@/lib/ws-client';
import type { BubbleInfo } from '@bubbles/shared';
import {
  updateBubble,
  createBubbleState,
  SIZE_RADIUS,
  type BubblePhysicsState,
} from '@/physics/bubblePhysics';

interface BubbleMeshProps {
  bubble: BubbleInfo;
  sharedGeometry: THREE.BufferGeometry;
  sharedMaterial: THREE.MeshStandardMaterial;
  onExpire: (bubbleId: string) => void;
  onPop: (
    bubbleId: string,
    position: THREE.Vector3,
    color: THREE.Color,
    size: number,
  ) => void;
}

const GROW_DURATION = 1.2;
const POP_DURATION = 0.3;
const _pos = new THREE.Vector3();

export function BubbleMesh({
  bubble,
  sharedGeometry,
  sharedMaterial,
  onExpire,
  onPop,
}: BubbleMeshProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);
  const radius = SIZE_RADIUS[bubble.size] * (0.8 + (bubble.seed % 100) * 0.004);
  const bubbleColor = useMemo(() => new THREE.Color(bubble.color), [bubble.color]);

  const physicsRef = useRef<BubblePhysicsState>(
    createBubbleState(bubble.x, bubble.y, bubble.z, bubble.size, bubble.seed),
  );
  const poppingRef = useRef(false);
  const popStartRef = useRef(0);

  // Per-bubble material clone — but it reuses the compiled shader program
  // since Three.js caches programs by shader source, not by material instance
  const material = useMemo(() => {
    const mat = sharedMaterial.clone();
    mat.color = bubbleColor;
    mat.emissive = bubbleColor.clone().multiplyScalar(0.3);
    return mat;
  }, [sharedMaterial, bubbleColor]);

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    const mesh = meshRef.current;
    if (!mesh || poppingRef.current) return;
    mesh.getWorldPosition(_pos);
    onPop(bubble.bubbleId, _pos.clone(), bubbleColor, radius);

    if (globalWsClient.isConnected()) {
      globalWsClient.send({ type: 'pop', data: { bubbleId: bubble.bubbleId } });
    }
  };

  useFrame((state, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const time = state.clock.elapsedTime;
    const dt = Math.min(delta, 0.05);

    updateBubble(physicsRef.current, dt, time);
    const physics = physicsRef.current;

    const timeLeft = bubble.expiresAt - Date.now();
    if (timeLeft <= 0 && !poppingRef.current) {
      poppingRef.current = true;
      popStartRef.current = time;
    }

    mesh.position.set(physics.position[0], physics.position[1], physics.position[2]);

    const age = physics.age;
    let scale = radius;
    let opacity = 0.5;

    if (age < GROW_DURATION) {
      const t = age / GROW_DURATION;
      const eased = 1 - Math.pow(1 - t, 2.5);
      const wobble = Math.sin(age * (5 + bubble.seed % 7)) * 0.06 * (1 - t);
      scale = radius * Math.max(0.01, eased + wobble);
      opacity = 0.5 * Math.min(1, t * 3);
    }

    if (poppingRef.current) {
      const popAge = time - popStartRef.current;
      if (popAge >= POP_DURATION) {
        onExpire(bubble.bubbleId);
        return;
      }
      const t = popAge / POP_DURATION;
      if (t < 0.25) {
        scale *= 1 + t * 1.5;
      } else {
        const shrink = (t - 0.25) / 0.75;
        scale *= 1.35 * (1 - shrink * shrink);
        opacity *= 1 - shrink;
      }
    }

    if (!poppingRef.current && age >= GROW_DURATION) {
      scale *= 1.0 + Math.sin(time * 2.5 + bubble.seed) * 0.03;
    }

    mesh.scale.setScalar(Math.max(0.001, scale));
    material.opacity = Math.max(0, Math.min(1, opacity));
  });

  return (
    <>
      <mesh
        ref={meshRef}
        geometry={sharedGeometry}
        material={material}
        position={[bubble.x, bubble.y, bubble.z]}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={handleClick}
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => setHovered(false)}
      />
      {hovered && meshRef.current && (
        <Html
          position={meshRef.current.position}
          center
          distanceFactor={8}
          style={{ pointerEvents: 'none' }}
        >
          <div style={{
            color: 'white', fontSize: 11,
            background: 'rgba(0,0,0,0.5)',
            padding: '2px 8px', borderRadius: 8, whiteSpace: 'nowrap',
          }}>
            {bubble.blownBy.displayName}
          </div>
        </Html>
      )}
    </>
  );
}
