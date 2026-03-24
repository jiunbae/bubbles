import * as THREE from 'three';
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { PlaceTheme } from '@bubbles/shared';

interface SkyEnvironmentProps {
  theme?: PlaceTheme;
}

// Simple ground plane — semi-transparent circle
function GroundPlane({ color = '#3a3a4a' }: { color?: string }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1, 0]}>
      <circleGeometry args={[12, 32]} />
      <meshStandardMaterial
        color={color}
        transparent
        opacity={0.3}
        roughness={0.9}
        metalness={0}
      />
    </mesh>
  );
}

// ═══════════════════════════════════════════════════════════════════
// ROOFTOP 🏙️ — Modern city streetlamps + neon accents + water tower
// ═══════════════════════════════════════════════════════════════════

function ModernStreetlamp({ position, height = 3.5 }: { position: [number, number, number]; height?: number }) {
  return (
    <group position={position}>
      {/* Tapered steel pole */}
      <mesh position={[0, height / 2, 0]}>
        <cylinderGeometry args={[0.025, 0.05, height, 8]} />
        <meshStandardMaterial color="#888" metalness={0.9} roughness={0.2} />
      </mesh>
      {/* Curved arm */}
      <mesh position={[0.4, height - 0.1, 0]} rotation={[0, 0, -0.6]}>
        <cylinderGeometry args={[0.015, 0.015, 0.9, 6]} />
        <meshStandardMaterial color="#888" metalness={0.9} roughness={0.2} />
      </mesh>
      {/* LED panel (rectangular) */}
      <mesh position={[0.7, height + 0.05, 0]} rotation={[0.2, 0, 0]}>
        <boxGeometry args={[0.3, 0.03, 0.15]} />
        <meshStandardMaterial color="#e0e8ff" emissive="#c0d8ff" emissiveIntensity={5} />
      </mesh>
      {/* Cool white LED light */}
      <pointLight color="#ddeeff" intensity={4} position={[0.7, height - 0.1, 0]} distance={10} decay={2} />
    </group>
  );
}

function NeonSign({ position }: { position: [number, number, number] }) {
  const ref = useRef<THREE.PointLight>(null);
  useFrame((state) => {
    if (ref.current) {
      ref.current.intensity = 2 + Math.sin(state.clock.elapsedTime * 8) * 0.3;
    }
  });
  return (
    <group position={position}>
      <mesh>
        <boxGeometry args={[0.8, 0.4, 0.03]} />
        <meshStandardMaterial color="#222" roughness={0.8} />
      </mesh>
      <mesh position={[0, 0, 0.03]}>
        <boxGeometry args={[0.6, 0.2, 0.02]} />
        <meshStandardMaterial color="#ff4488" emissive="#ff2266" emissiveIntensity={4} transparent opacity={0.9} />
      </mesh>
      <pointLight ref={ref} color="#ff4488" intensity={2} position={[0, 0, 0.3]} distance={6} decay={2} />
    </group>
  );
}

function RooftopEnvironment() {
  return (
    <>
      <color attach="background" args={['#1a1a30']} />
      <ambientLight color="#6680aa" intensity={0.8} />
      <directionalLight color="#ffa54f" intensity={2.5} position={[8, 6, 3]} />
      <directionalLight color="#6688bb" intensity={0.8} position={[-5, 4, -5]} />
      <GroundPlane color="#3a3a4a" />

      {/* Modern railing */}
      {[-6, -3, 0, 3, 6].map((x) => (
        <mesh key={x} position={[x, 0, -6]}>
          <boxGeometry args={[0.04, 1.2, 0.04]} />
          <meshStandardMaterial color="#667" metalness={0.8} roughness={0.2} />
        </mesh>
      ))}
      <mesh position={[0, 0.5, -6]}>
        <boxGeometry args={[13, 0.025, 0.025]} />
        <meshStandardMaterial color="#556" metalness={0.8} roughness={0.2} />
      </mesh>
      <mesh position={[0, -0.1, -6]}>
        <boxGeometry args={[13, 0.025, 0.025]} />
        <meshStandardMaterial color="#556" metalness={0.8} roughness={0.2} />
      </mesh>

      {/* AC unit with vent */}
      <mesh position={[5, -0.5, -4]}>
        <boxGeometry args={[1, 0.7, 0.7]} />
        <meshStandardMaterial color="#555" roughness={0.7} metalness={0.3} />
      </mesh>
      <mesh position={[5, -0.3, -3.64]}>
        <boxGeometry args={[0.8, 0.3, 0.01]} />
        <meshStandardMaterial color="#333" metalness={0.6} roughness={0.4} />
      </mesh>

      {/* Modern streetlamps */}
      <ModernStreetlamp position={[-4, -1, -3]} height={3.5} />
      <ModernStreetlamp position={[3, -1, 4]} height={3.0} />

      {/* Neon sign */}
      <NeonSign position={[-2, 1.5, -5.9]} />

      {/* Water tower silhouette */}
      <group position={[6, -1, -5]}>
        {[[-0.3, 0, -0.3], [0.3, 0, -0.3], [-0.3, 0, 0.3], [0.3, 0, 0.3]].map(([x, _, z], i) => (
          <mesh key={i} position={[x, 0.8, z]}>
            <cylinderGeometry args={[0.03, 0.03, 1.6, 4]} />
            <meshStandardMaterial color="#444" roughness={0.8} />
          </mesh>
        ))}
        <mesh position={[0, 1.8, 0]}>
          <cylinderGeometry args={[0.5, 0.45, 0.8, 8]} />
          <meshStandardMaterial color="#555" roughness={0.9} metalness={0.2} />
        </mesh>
      </group>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════
// PARK 🌳 — Victorian garden lamps + fireflies + moonlight
// ═══════════════════════════════════════════════════════════════════

function ParkLamp({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* Ornamental base */}
      <mesh position={[0, 0.1, 0]}>
        <cylinderGeometry args={[0.12, 0.15, 0.2, 8]} />
        <meshStandardMaterial color="#2a2a20" metalness={0.7} roughness={0.4} />
      </mesh>
      {/* Tapered pole */}
      <mesh position={[0, 1.4, 0]}>
        <cylinderGeometry args={[0.03, 0.06, 2.6, 8]} />
        <meshStandardMaterial color="#3a3a30" metalness={0.6} roughness={0.4} />
      </mesh>
      {/* Decorative collar */}
      <mesh position={[0, 2.5, 0]}>
        <cylinderGeometry args={[0.08, 0.04, 0.15, 8]} />
        <meshStandardMaterial color="#3a3a30" metalness={0.7} roughness={0.3} />
      </mesh>
      {/* Glass globe lantern */}
      <mesh position={[0, 2.85, 0]}>
        <sphereGeometry args={[0.12, 12, 12]} />
        <meshStandardMaterial
          color="#fff8e0"
          emissive="#ffcc44"
          emissiveIntensity={3}
          transparent
          opacity={0.85}
        />
      </mesh>
      {/* Cap */}
      <mesh position={[0, 3.02, 0]}>
        <coneGeometry args={[0.1, 0.12, 6]} />
        <meshStandardMaterial color="#3a3a30" metalness={0.7} roughness={0.3} />
      </mesh>
      {/* Warm light */}
      <pointLight color="#ffdd88" intensity={3} position={[0, 2.85, 0]} distance={8} decay={2} />
    </group>
  );
}

function Fireflies({ count = 12, area = 8 }: { count?: number; area?: number }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const dummy = useRef(new THREE.Object3D()).current;
  const offsets = useRef(
    Array.from({ length: count }, () => ({
      x: (Math.random() - 0.5) * area,
      y: 0.5 + Math.random() * 3,
      z: (Math.random() - 0.5) * area,
      speed: 0.3 + Math.random() * 0.7,
      phase: Math.random() * Math.PI * 2,
      radius: 0.5 + Math.random() * 1.5,
    }))
  ).current;

  useFrame((state) => {
    if (!ref.current) return;
    const t = state.clock.elapsedTime;
    for (let i = 0; i < count; i++) {
      const o = offsets[i];
      dummy.position.set(
        o.x + Math.sin(t * o.speed + o.phase) * o.radius,
        o.y + Math.sin(t * o.speed * 0.7 + o.phase * 2) * 0.5,
        o.z + Math.cos(t * o.speed + o.phase) * o.radius,
      );
      dummy.scale.setScalar(0.015 + Math.sin(t * 3 + o.phase) * 0.01);
      dummy.updateMatrix();
      ref.current.setMatrixAt(i, dummy.matrix);
    }
    ref.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, count]}>
      <sphereGeometry args={[1, 4, 4]} />
      <meshStandardMaterial color="#ccff44" emissive="#aaee22" emissiveIntensity={8} transparent opacity={0.7} />
    </instancedMesh>
  );
}

function ParkEnvironment() {
  return (
    <>
      <color attach="background" args={['#101e10']} />
      <ambientLight color="#446644" intensity={0.7} />
      <directionalLight color="#eeeedd" intensity={1.2} position={[5, 10, 5]} />
      <directionalLight color="#8899bb" intensity={0.3} position={[-4, 6, -3]} />
      {/* Moonlight */}
      <directionalLight color="#aabbdd" intensity={0.4} position={[-2, 8, -1]} />
      <GroundPlane color="#1a3a1a" />

      {/* Trees — varied heights */}
      {[
        { pos: [-5, -1, -4] as [number, number, number], h: 2.2, r: 1.1, color: '#1a5a1a' },
        { pos: [6, -1, -5] as [number, number, number], h: 2.8, r: 1.3, color: '#2a6a2a' },
        { pos: [-7, -1, 2] as [number, number, number], h: 1.8, r: 0.9, color: '#1a5a1a' },
        { pos: [7, -1, 1] as [number, number, number], h: 2.5, r: 1.2, color: '#226622' },
        { pos: [-3, -1, -6] as [number, number, number], h: 3.0, r: 1.0, color: '#2a6a2a' },
      ].map(({ pos, h, r, color }, i) => (
        <group key={i} position={pos}>
          <mesh position={[0, h / 2, 0]}>
            <cylinderGeometry args={[0.08, 0.13, h, 6]} />
            <meshStandardMaterial color="#5a3a1a" roughness={0.9} />
          </mesh>
          <mesh position={[0, h + r * 0.5, 0]}>
            <sphereGeometry args={[r, 8, 8]} />
            <meshStandardMaterial color={color} roughness={0.9} />
          </mesh>
        </group>
      ))}

      {/* Bench with metal legs */}
      <group position={[3, -1, -3]} rotation={[0, -0.3, 0]}>
        <mesh position={[0, 0.35, 0]}>
          <boxGeometry args={[1.2, 0.05, 0.35]} />
          <meshStandardMaterial color="#6a4a14" roughness={0.85} />
        </mesh>
        <mesh position={[0, 0.6, -0.16]}>
          <boxGeometry args={[1.2, 0.4, 0.05]} />
          <meshStandardMaterial color="#6a4a14" roughness={0.85} />
        </mesh>
        {[-0.5, 0.5].map((x) => (
          <mesh key={x} position={[x, 0.15, 0]}>
            <boxGeometry args={[0.04, 0.3, 0.3]} />
            <meshStandardMaterial color="#444" metalness={0.7} roughness={0.3} />
          </mesh>
        ))}
      </group>

      {/* Victorian park lamps */}
      <ParkLamp position={[-2, -1, -2]} />
      <ParkLamp position={[5, -1, 0]} />
      <ParkLamp position={[0, -1, 5]} />

      {/* Fireflies */}
      <Fireflies count={15} area={9} />
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════
// ALLEY 🏮 — Paper lanterns + wall bracket lamps + neon sign
// ═══════════════════════════════════════════════════════════════════

function PaperLantern({ position, color = '#ff4422' }: { position: [number, number, number]; color?: string }) {
  const lightRef = useRef<THREE.PointLight>(null);
  useFrame((state) => {
    if (lightRef.current) {
      lightRef.current.intensity = 2.5 + Math.sin(state.clock.elapsedTime * 1.5 + position[0]) * 0.5;
    }
  });
  return (
    <group position={position}>
      {/* Wire */}
      <mesh position={[0, 0.2, 0]}>
        <cylinderGeometry args={[0.005, 0.005, 0.4, 4]} />
        <meshStandardMaterial color="#444" />
      </mesh>
      {/* Lantern body */}
      <mesh>
        <sphereGeometry args={[0.15, 8, 8]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={2}
          transparent
          opacity={0.8}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* Top/bottom rings */}
      <mesh position={[0, 0.12, 0]}>
        <cylinderGeometry args={[0.05, 0.05, 0.02, 8]} />
        <meshStandardMaterial color="#aa8844" metalness={0.6} roughness={0.3} />
      </mesh>
      <mesh position={[0, -0.12, 0]}>
        <cylinderGeometry args={[0.04, 0.04, 0.02, 8]} />
        <meshStandardMaterial color="#aa8844" metalness={0.6} roughness={0.3} />
      </mesh>
      <pointLight ref={lightRef} color={color} intensity={2.5} position={[0, 0, 0]} distance={6} decay={2} />
    </group>
  );
}

function WallBracketLamp({ position, side = 'left' }: { position: [number, number, number]; side?: 'left' | 'right' }) {
  const dir = side === 'left' ? 1 : -1;
  return (
    <group position={position}>
      {/* Wall bracket */}
      <mesh position={[dir * 0.15, 0, 0]} rotation={[0, 0, dir * 0.3]}>
        <boxGeometry args={[0.3, 0.04, 0.04]} />
        <meshStandardMaterial color="#5a4a30" metalness={0.6} roughness={0.4} />
      </mesh>
      {/* Lamp cage */}
      <mesh position={[dir * 0.3, -0.05, 0]}>
        <cylinderGeometry args={[0.06, 0.08, 0.15, 6]} />
        <meshStandardMaterial color="#6a5a40" metalness={0.5} roughness={0.5} transparent opacity={0.6} />
      </mesh>
      {/* Flame/bulb */}
      <mesh position={[dir * 0.3, -0.02, 0]}>
        <sphereGeometry args={[0.035, 6, 6]} />
        <meshStandardMaterial color="#ffeecc" emissive="#ffaa44" emissiveIntensity={5} />
      </mesh>
      <pointLight color="#ffaa44" intensity={2} position={[dir * 0.3, -0.02, 0]} distance={5} decay={2} />
    </group>
  );
}

function AlleyEnvironment() {
  return (
    <>
      <color attach="background" args={['#141010']} />
      <ambientLight color="#554433" intensity={0.7} />
      <directionalLight color="#667788" intensity={0.6} position={[0, 8, 2]} />
      <GroundPlane color="#2a2018" />

      {/* Brick walls */}
      <mesh position={[-5, 1, 0]}>
        <boxGeometry args={[0.3, 5, 14]} />
        <meshStandardMaterial color="#5a3010" roughness={0.95} />
      </mesh>
      <mesh position={[5, 1, 0]}>
        <boxGeometry args={[0.3, 5, 14]} />
        <meshStandardMaterial color="#4a2810" roughness={0.95} />
      </mesh>
      {/* Wall ledges */}
      <mesh position={[-4.8, 2.5, 0]}>
        <boxGeometry args={[0.1, 0.08, 13]} />
        <meshStandardMaterial color="#6a4020" roughness={0.9} />
      </mesh>
      <mesh position={[4.8, 2.5, 0]}>
        <boxGeometry args={[0.1, 0.08, 13]} />
        <meshStandardMaterial color="#5a3818" roughness={0.9} />
      </mesh>

      {/* String of paper lanterns */}
      {[
        { pos: [-1.5, 3.2, -3] as [number, number, number], color: '#ff4422' },
        { pos: [0, 3.0, -1.5] as [number, number, number], color: '#ff6622' },
        { pos: [1.2, 3.3, 0] as [number, number, number], color: '#ff4422' },
        { pos: [-0.5, 3.1, 1.5] as [number, number, number], color: '#ffaa22' },
        { pos: [1.0, 3.2, 3] as [number, number, number], color: '#ff4422' },
      ].map(({ pos, color }, i) => (
        <PaperLantern key={i} position={pos} color={color} />
      ))}
      {/* Wire connecting lanterns */}
      <mesh position={[0, 3.4, 0]} rotation={[0, 0.3, 0]}>
        <cylinderGeometry args={[0.003, 0.003, 10, 4]} />
        <meshStandardMaterial color="#333" />
      </mesh>

      {/* Wall bracket lamps */}
      <WallBracketLamp position={[-4.7, 2, -4]} side="left" />
      <WallBracketLamp position={[4.7, 2.2, -2]} side="right" />
      <WallBracketLamp position={[-4.7, 1.8, 2]} side="left" />
      <WallBracketLamp position={[4.7, 2, 4]} side="right" />

      {/* Ground clutter */}
      <mesh position={[-3.5, -0.5, 2]}>
        <boxGeometry args={[0.5, 0.5, 0.5]} />
        <meshStandardMaterial color="#6a4a14" roughness={0.9} />
      </mesh>
      <mesh position={[-3.2, -0.7, 2.5]}>
        <boxGeometry args={[0.35, 0.35, 0.35]} />
        <meshStandardMaterial color="#5a3a10" roughness={0.9} />
      </mesh>
      {/* Puddle */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[1, -0.98, 1]}>
        <circleGeometry args={[0.6, 16]} />
        <meshStandardMaterial color="#1a1510" metalness={0.8} roughness={0.1} transparent opacity={0.4} />
      </mesh>

      {/* Neon sign on wall */}
      <group position={[4.7, 1, -5]} rotation={[0, -Math.PI / 2, 0]}>
        <mesh>
          <boxGeometry args={[0.5, 0.25, 0.02]} />
          <meshStandardMaterial color="#111" roughness={0.8} />
        </mesh>
        <mesh position={[0, 0, 0.02]}>
          <boxGeometry args={[0.35, 0.12, 0.01]} />
          <meshStandardMaterial color="#44aaff" emissive="#2288ff" emissiveIntensity={3} transparent opacity={0.9} />
        </mesh>
        <pointLight color="#4488ff" intensity={1.5} position={[0, 0, 0.2]} distance={4} decay={2} />
      </group>
    </>
  );
}

export function SkyEnvironment({ theme = 'rooftop' }: SkyEnvironmentProps) {
  switch (theme) {
    case 'park':
      return <ParkEnvironment />;
    case 'alley':
      return <AlleyEnvironment />;
    case 'rooftop':
    default:
      return <RooftopEnvironment />;
  }
}
