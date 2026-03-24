import { useRef, useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { useCursorStore, type RemoteCursor } from '@/stores/cursor-store';

const STALE_TIMEOUT = 3000;
const LERP_SPEED = 0.12;

/**
 * A single remote user's wand cursor in 3D space.
 */
function RemoteWand({
  cursor,
  sessionId,
}: {
  cursor: RemoteCursor;
  sessionId: string;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const targetRef = useRef(new THREE.Vector3());
  const initializedRef = useRef(false);
  const { camera } = useThree();

  // Unproject the normalized screen coordinates to 3D
  useFrame(() => {
    const g = groupRef.current;
    if (!g) return;

    // Convert normalized coords to NDC (-1 to 1)
    const ndc = new THREE.Vector3(cursor.x * 2 - 1, -(cursor.y * 2 - 1), 0.5);
    ndc.unproject(camera);

    const dir = ndc.sub(camera.position).normalize();
    const target = camera.position.clone().addScaledVector(dir, 5);
    targetRef.current.copy(target);

    if (!initializedRef.current) {
      g.position.copy(targetRef.current);
      initializedRef.current = true;
    } else {
      g.position.lerp(targetRef.current, LERP_SPEED);
    }

    g.lookAt(camera.position);
  });

  return (
    <group ref={groupRef}>
      {/* Torus ring */}
      <mesh>
        <torusGeometry args={[0.15, 0.012, 8, 16]} />
        <meshStandardMaterial
          color={cursor.color}
          emissive={cursor.color}
          emissiveIntensity={0.6}
          transparent
          opacity={0.6}
        />
      </mesh>
      {/* Wand handle */}
      <mesh position={[0, -0.28, 0]}>
        <cylinderGeometry args={[0.01, 0.013, 0.3, 6]} />
        <meshStandardMaterial color="#aa8855" transparent opacity={0.35} />
      </mesh>
      {/* Soap film */}
      <mesh>
        <circleGeometry args={[0.13, 10]} />
        <meshStandardMaterial
          color={cursor.color}
          emissive={cursor.color}
          emissiveIntensity={0.15}
          transparent
          opacity={0.08}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* Floating name label */}
      <Html
        position={[0, 0.3, 0]}
        center
        style={{
          pointerEvents: 'none',
          userSelect: 'none',
          whiteSpace: 'nowrap',
        }}
      >
        <div
          style={{
            background: 'rgba(0, 0, 0, 0.55)',
            color: cursor.color,
            fontSize: 11,
            padding: '2px 6px',
            borderRadius: 4,
            fontFamily: 'system-ui, sans-serif',
            fontWeight: 500,
            letterSpacing: 0.3,
          }}
        >
          {cursor.displayName}
        </div>
      </Html>
    </group>
  );
}

/**
 * Renders all remote user cursors in the 3D scene.
 * Prunes stale cursors every second.
 */
export function RemoteCursors() {
  const remoteCursors = useCursorStore((s) => s.remoteCursors);
  const pruneStale = useCursorStore((s) => s.pruneStale);

  // Prune stale cursors periodically
  useEffect(() => {
    const interval = setInterval(() => {
      pruneStale(STALE_TIMEOUT);
    }, 1000);
    return () => clearInterval(interval);
  }, [pruneStale]);

  const entries = useMemo(() => Array.from(remoteCursors.entries()), [remoteCursors]);

  return (
    <group>
      {entries.map(([sessionId, cursor]) => (
        <RemoteWand key={sessionId} sessionId={sessionId} cursor={cursor} />
      ))}
    </group>
  );
}
