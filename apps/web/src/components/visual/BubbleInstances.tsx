import { useRef, useMemo, useEffect, useCallback, useState } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { globalWsClient } from '@/lib/ws-client';
import { playPop } from '@/lib/sounds';
import { useBubbleStore } from '@/stores/bubble-store';
import type { BubbleInfo } from '@bubbles/shared';
import {
  updateBubble,
  createBubbleState,
  SIZE_RADIUS,
  type BubblePhysicsState,
} from '@/physics/bubblePhysics';

const MAX_BUBBLES = 80;
const GROW_DURATION = 1.2;
const POP_DURATION = 0.3;

/** Per-bubble runtime state tracked outside React for perf. */
interface BubbleInstanceState {
  bubble: BubbleInfo;
  physics: BubblePhysicsState;
  radius: number;
  color: THREE.Color;
  emissive: THREE.Color;
  popping: boolean;
  popStart: number; // globalTime when pop began
  slotIndex: number; // index into the InstancedMesh
}

// Reusable scratch objects (allocated once, never GC'd)
const _dummy = new THREE.Object3D();
const _color = new THREE.Color();
const _pos = new THREE.Vector3();

interface BubbleInstancesProps {
  onPop: (
    bubbleId: string,
    position: THREE.Vector3,
    color: THREE.Color,
    size: number,
  ) => void;
  onExpire: (bubbleId: string) => void;
}

export function BubbleInstances({ onPop, onExpire }: BubbleInstancesProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // --- Stable refs for callbacks used inside useFrame ---
  const onPopRef = useRef(onPop);
  const onExpireRef = useRef(onExpire);
  onPopRef.current = onPop;
  onExpireRef.current = onExpire;

  // Map from bubbleId -> per-bubble state.
  // This is a ref so useFrame has zero-cost access (no re-renders).
  const stateMapRef = useRef(new Map<string, BubbleInstanceState>());

  // Reverse lookup: slotIndex -> bubbleId (O(1) click/hover resolution)
  const slotToIdRef = useRef(new Map<number, string>());

  // Slot allocator: recycled indices for the InstancedMesh
  const freeSlotsRef = useRef<number[]>(
    Array.from({ length: MAX_BUBBLES }, (_, i) => MAX_BUBBLES - 1 - i),
  );
  const activeCountRef = useRef(0);

  // Shared geometry & material (created once)
  const geometry = useMemo(() => new THREE.IcosahedronGeometry(1, 3), []);
  const material = useMemo(() => {
    const mat = new THREE.MeshStandardMaterial({
      metalness: 0.2,
      roughness: 0.05,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide,
      depthWrite: false,
      emissive: new THREE.Color('#6699cc'),
      emissiveIntensity: 0.3,
      envMapIntensity: 0,
    });

    // Inject per-instance opacity + Fresnel rim glow via onBeforeCompile.
    mat.onBeforeCompile = (shader) => {
      // Vertex: pass instance opacity + world normal/view dir for Fresnel
      shader.vertexShader = shader.vertexShader
        .replace(
          'void main() {',
          [
            'attribute float instanceOpacity;',
            'varying float vInstanceOpacity;',
            'varying vec3 vWorldNormal;',
            'varying vec3 vViewDir;',
            'void main() {',
            '  vInstanceOpacity = instanceOpacity;',
          ].join('\n'),
        );
      // Compute world normal and view direction after position is known
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <worldpos_vertex>',
          [
            '#include <worldpos_vertex>',
            'vWorldNormal = normalize((modelMatrix * vec4(objectNormal, 0.0)).xyz);',
            'vViewDir = normalize(cameraPosition - (modelMatrix * vec4(position, 1.0)).xyz);',
          ].join('\n'),
        );

      // Fragment: Fresnel rim glow + per-instance opacity
      shader.fragmentShader = shader.fragmentShader
        .replace(
          'void main() {',
          [
            'varying float vInstanceOpacity;',
            'varying vec3 vWorldNormal;',
            'varying vec3 vViewDir;',
            'void main() {',
          ].join('\n'),
        );
      // Apply Fresnel rim glow + instance opacity before final output
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <dithering_fragment>',
          [
            '// Fresnel rim glow — edges of bubble glow brighter',
            'float fresnelDot = max(dot(normalize(vWorldNormal), normalize(vViewDir)), 0.0);',
            'float fresnel = pow(1.0 - fresnelDot, 3.0);',
            '// Add rim glow: tinted by diffuse color, additive blend',
            'vec3 rimColor = gl_FragColor.rgb * 1.5 + vec3(0.3, 0.5, 0.8);',
            'gl_FragColor.rgb += rimColor * fresnel * 0.6;',
            '// Fresnel also boosts alpha at edges (like real soap film)',
            'float fresnelAlpha = mix(0.15, 0.7, fresnel);',
            'gl_FragColor.a = fresnelAlpha * vInstanceOpacity;',
            '#include <dithering_fragment>',
          ].join('\n'),
        );
    };

    return mat;
  }, []);

  // Per-instance opacity buffer (attribute)
  const opacityArray = useMemo(() => new Float32Array(MAX_BUBBLES).fill(0), []);

  // Initialise InstancedMesh: hide all instances at scale 0
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    // Add instanceOpacity attribute
    mesh.geometry.setAttribute(
      'instanceOpacity',
      new THREE.InstancedBufferAttribute(opacityArray, 1),
    );

    // Hide all instances initially — move far away so they don't intercept raycasts
    _dummy.position.set(0, -1000, 0);
    _dummy.scale.setScalar(0.001);
    _dummy.updateMatrix();
    for (let i = 0; i < MAX_BUBBLES; i++) {
      mesh.setMatrixAt(i, _dummy.matrix);
      mesh.setColorAt(i, _color.set(0x000000));
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.count = MAX_BUBBLES;
  }, [opacityArray]);

  // --- Sync store bubbles -> stateMap ---
  // Subscribe directly (not via selector) so we get fine-grained control.
  useEffect(() => {
    const unsub = useBubbleStore.subscribe((state) => {
      const stateMap = stateMapRef.current;
      const slotToId = slotToIdRef.current;
      const freeSlots = freeSlotsRef.current;
      const storeBubbles = state.bubbles;
      const mesh = meshRef.current;
      let colorDirty = false;

      // Remove entries that are no longer in the store
      for (const [id, entry] of stateMap) {
        if (!storeBubbles.has(id)) {
          freeSlots.push(entry.slotIndex);
          slotToId.delete(entry.slotIndex);
          stateMap.delete(id);
          activeCountRef.current--;

          if (mesh) {
            _dummy.position.set(0, -1000, 0);
            _dummy.scale.setScalar(0.001);
            _dummy.updateMatrix();
            mesh.setMatrixAt(entry.slotIndex, _dummy.matrix);
            opacityArray[entry.slotIndex] = 0;
          }
        }
      }

      // Add new entries
      for (const [id, bubble] of storeBubbles) {
        if (!stateMap.has(id)) {
          if (freeSlots.length === 0) continue;
          const slot = freeSlots.pop()!;
          const radius =
            SIZE_RADIUS[bubble.size] * (0.8 + (bubble.seed % 100) * 0.004);
          const color = new THREE.Color(bubble.color);

          stateMap.set(id, {
            bubble,
            physics: createBubbleState(
              bubble.x,
              bubble.y,
              bubble.z,
              bubble.size,
              bubble.seed,
            ),
            radius,
            color,
            emissive: color.clone().multiplyScalar(0.1),
            popping: false,
            popStart: 0,
            slotIndex: slot,
          });
          slotToId.set(slot, id);
          activeCountRef.current++;

          // Set color once at creation (not every frame)
          if (mesh) {
            mesh.setColorAt(slot, color);
            colorDirty = true;
          }
        }
      }

      if (colorDirty && mesh?.instanceColor) {
        mesh.instanceColor.needsUpdate = true;
      }
    });

    return unsub;
  }, [opacityArray]);

  // --- Single useFrame: update physics + matrices for all bubbles ---
  useFrame((_state, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const stateMap = stateMapRef.current;
    if (stateMap.size === 0) return;

    const nowMs = Date.now();
    const dt = Math.min(delta, 0.05);
    let matrixDirty = false;
    const expired: string[] = [];

    for (const [id, entry] of stateMap) {
      const { bubble, physics } = entry;
      const createdAtSec = bubble.createdAt / 1000;
      const time = nowMs / 1000 - createdAtSec;

      // Physics step
      updateBubble(physics, dt, time);

      // Check expiry
      const timeLeft = bubble.expiresAt - nowMs;
      if (timeLeft <= 0 && !entry.popping) {
        entry.popping = true;
        entry.popStart = time;
      }

      // Position
      _dummy.position.set(
        physics.position[0],
        physics.position[1],
        physics.position[2],
      );

      // Scale + opacity (opacity is a multiplier for the Fresnel shader)
      const age = physics.age;
      let scale = entry.radius;
      let opacity = 1.0;

      // Grow animation
      if (age < GROW_DURATION) {
        const t = age / GROW_DURATION;
        const eased = 1 - Math.pow(1 - t, 2.5);
        const wobble =
          Math.sin(age * (5 + (bubble.seed % 7))) * 0.06 * (1 - t);
        scale = entry.radius * Math.max(0.01, eased + wobble);
        opacity = Math.min(1, t * 3);
      }

      // Pop animation
      if (entry.popping) {
        const popAge = time - entry.popStart;
        if (popAge >= POP_DURATION) {
          expired.push(id);
          // Hide immediately — move far away to avoid raycast hits
          _dummy.position.set(0, -1000, 0);
          _dummy.scale.setScalar(0.001);
          _dummy.updateMatrix();
          mesh.setMatrixAt(entry.slotIndex, _dummy.matrix);
          opacityArray[entry.slotIndex] = 0;
          matrixDirty = true;
          continue;
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

      // Idle wobble (breathing)
      if (!entry.popping && age >= GROW_DURATION) {
        scale *= 1.0 + Math.sin(time * 2.5 + bubble.seed) * 0.03;
      }

      _dummy.scale.setScalar(Math.max(0.001, scale));
      _dummy.updateMatrix();
      mesh.setMatrixAt(entry.slotIndex, _dummy.matrix);

      // Per-instance opacity
      opacityArray[entry.slotIndex] = Math.max(0, Math.min(1, opacity));

      matrixDirty = true;
    }

    if (matrixDirty) {
      mesh.instanceMatrix.needsUpdate = true;
      const opacityAttr = mesh.geometry.getAttribute('instanceOpacity');
      if (opacityAttr) (opacityAttr as THREE.BufferAttribute).needsUpdate = true;
    }

    // Fire expire callbacks outside the loop to avoid mutating during iteration
    for (const id of expired) {
      onExpireRef.current(id);
    }
  });

  // --- Click handler (O(1) via reverse map) ---
  const handleClick = useCallback((e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    const instanceId = e.instanceId;
    if (instanceId === undefined) return;

    const id = slotToIdRef.current.get(instanceId);
    if (!id) return;
    const entry = stateMapRef.current.get(id);
    if (!entry || entry.popping) return;

    _pos.set(
      entry.physics.position[0],
      entry.physics.position[1],
      entry.physics.position[2],
    );
    onPopRef.current(id, _pos.clone(), entry.color, entry.radius);
    playPop();

    if (globalWsClient.isConnected()) {
      globalWsClient.send({ type: 'pop', data: { bubbleId: id } });
    }
  }, []);

  // --- Hover handler (O(1) via reverse map, guarded to avoid re-renders) ---
  const hoveredIdRef = useRef<string | null>(null);
  const handlePointerMove = useCallback((e: ThreeEvent<PointerEvent>) => {
    const instanceId = e.instanceId;
    const newId = instanceId !== undefined
      ? (slotToIdRef.current.get(instanceId) ?? null)
      : null;
    if (newId !== hoveredIdRef.current) {
      hoveredIdRef.current = newId;
      setHoveredId(newId);
    }
  }, []);

  const handlePointerLeave = useCallback(() => {
    setHoveredId(null);
  }, []);

  // Tooltip position
  const hoveredEntry = hoveredId ? stateMapRef.current.get(hoveredId) : null;
  const tooltipPos = hoveredEntry
    ? ([
        hoveredEntry.physics.position[0],
        hoveredEntry.physics.position[1],
        hoveredEntry.physics.position[2],
      ] as [number, number, number])
    : null;

  return (
    <>
      <instancedMesh
        ref={meshRef}
        args={[geometry, material, MAX_BUBBLES]}
        frustumCulled={false}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={handleClick}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
      />
      {hoveredEntry && tooltipPos && (
        <Html
          position={tooltipPos}
          center
          distanceFactor={8}
          style={{ pointerEvents: 'none' }}
        >
          <div
            style={{
              color: 'white',
              fontSize: 11,
              background: 'rgba(0,0,0,0.5)',
              padding: '2px 8px',
              borderRadius: 8,
              whiteSpace: 'nowrap',
            }}
          >
            {hoveredEntry.bubble.blownBy.displayName}
          </div>
        </Html>
      )}
    </>
  );
}
