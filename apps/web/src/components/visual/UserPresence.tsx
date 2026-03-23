import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { usePlaceStore } from '@/stores/place-store';

/**
 * Shows other users as floating glowing dots with names.
 * Each user has a unique pastel color and gentle bobbing animation.
 */
export function UserPresence() {
  const onlineUsers = usePlaceStore((s) => s.onlineUsers);

  // Filter out self (sessionId 'local')
  const otherUsers = onlineUsers.filter((u) => u.sessionId !== 'local');

  if (otherUsers.length === 0) return null;

  return (
    <group>
      {otherUsers.map((user, i) => (
        <UserDot
          key={user.sessionId}
          displayName={user.displayName}
          color={user.color || PRESENCE_COLORS[i % PRESENCE_COLORS.length]}
          index={i}
        />
      ))}
    </group>
  );
}

const PRESENCE_COLORS = [
  '#FFB5C2', '#87CEEB', '#98FB98', '#DDA0DD',
  '#FFD700', '#FFDAB9', '#FF69B4', '#00CED1',
];

function UserDot({
  displayName,
  color,
  index,
}: {
  displayName: string;
  color: string;
  index: number;
}) {
  const ref = useRef<THREE.Mesh>(null);

  // Distribute around a circle, bobbing gently
  const angle = (index / 8) * Math.PI * 2 + Math.PI / 4;
  const radius = 3.5;
  const baseX = Math.cos(angle) * radius;
  const baseZ = Math.sin(angle) * radius;

  useFrame((state) => {
    if (!ref.current) return;
    const t = state.clock.elapsedTime;
    ref.current.position.y = 1.5 + Math.sin(t * 1.5 + index * 2) * 0.15;
  });

  return (
    <mesh ref={ref} position={[baseX, 1.5, baseZ]}>
      <sphereGeometry args={[0.12, 12, 12]} />
      <meshStandardMaterial
        color={color}
        emissive={color}
        emissiveIntensity={0.8}
        transparent
        opacity={0.7}
      />
      <Html
        center
        distanceFactor={8}
        style={{
          pointerEvents: 'none',
          whiteSpace: 'nowrap',
        }}
      >
        <div
          style={{
            color: 'rgba(255,255,255,0.7)',
            fontSize: 11,
            fontFamily: 'system-ui, sans-serif',
            background: 'rgba(0,0,0,0.4)',
            padding: '2px 8px',
            borderRadius: 10,
            transform: 'translateY(-20px)',
          }}
        >
          {displayName}
        </div>
      </Html>
    </mesh>
  );
}
