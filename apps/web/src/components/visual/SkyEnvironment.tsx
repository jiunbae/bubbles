import * as THREE from 'three';
import type { PlaceTheme } from '@bubbles/shared';

interface SkyEnvironmentProps {
  theme?: PlaceTheme;
}

// Simple ground plane — no custom shader, just a semi-transparent circle
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

// ─── Rooftop: railing + AC unit ───
function Streetlamp({ position }: { position: [number, number, number] }) {
  const [x, y, z] = position;
  return (
    <group position={position}>
      {/* Pole */}
      <mesh position={[0, 1.5, 0]}>
        <cylinderGeometry args={[0.03, 0.04, 3, 6]} />
        <meshStandardMaterial color="#555" metalness={0.8} roughness={0.3} />
      </mesh>
      {/* Arm */}
      <mesh position={[0.3, 2.9, 0]} rotation={[0, 0, -0.4]}>
        <cylinderGeometry args={[0.02, 0.02, 0.7, 4]} />
        <meshStandardMaterial color="#555" metalness={0.8} roughness={0.3} />
      </mesh>
      {/* Lamp head */}
      <mesh position={[0.5, 3.05, 0]}>
        <sphereGeometry args={[0.08, 8, 8]} />
        <meshStandardMaterial color="#fff8e0" emissive="#ffcc66" emissiveIntensity={4} />
      </mesh>
      {/* Light */}
      <pointLight color="#ffd080" intensity={3} position={[0.5, 3.0, 0]} distance={10} decay={2} />
    </group>
  );
}

function RooftopEnvironment() {
  return (
    <>
      <color attach="background" args={['#1a1a2e']} />
      <ambientLight color="#334466" intensity={0.4} />
      <directionalLight color="#ffa54f" intensity={2.5} position={[8, 6, 3]} />
      <directionalLight color="#87ceeb" intensity={0.6} position={[-5, 4, -5]} />
      <GroundPlane color="#4a4a5a" />
      {/* Railing */}
      {[-6, -3, 0, 3, 6].map((x) => (
        <mesh key={x} position={[x, 0, -6]}>
          <boxGeometry args={[0.06, 1.5, 0.06]} />
          <meshStandardMaterial color="#777" metalness={0.7} roughness={0.3} />
        </mesh>
      ))}
      <mesh position={[0, 0.7, -6]}>
        <boxGeometry args={[13, 0.04, 0.04]} />
        <meshStandardMaterial color="#666" metalness={0.7} roughness={0.3} />
      </mesh>
      {/* AC unit */}
      <mesh position={[5, -0.5, -4]}>
        <boxGeometry args={[1, 0.7, 0.7]} />
        <meshStandardMaterial color="#666" roughness={0.8} />
      </mesh>
      {/* Streetlamp */}
      <Streetlamp position={[-4, -1, -3]} />
    </>
  );
}

// ─── Park: trees + bench ───
function ParkEnvironment() {
  return (
    <>
      <color attach="background" args={['#0e1a0e']} />
      <ambientLight color="#223322" intensity={0.3} />
      <directionalLight color="#fffbe6" intensity={2.0} position={[5, 10, 5]} />
      <directionalLight color="#b3d9ff" intensity={0.5} position={[-4, 6, -3]} />
      <GroundPlane color="#2a4a2a" />
      {/* Trees */}
      {[[-5, -4], [6, -5], [-7, 2], [7, 1]].map(([x, z], i) => (
        <group key={i} position={[x, -1, z]}>
          <mesh position={[0, 1, 0]}>
            <cylinderGeometry args={[0.1, 0.15, 2, 6]} />
            <meshStandardMaterial color="#5a3a1a" roughness={0.9} />
          </mesh>
          <mesh position={[0, 2.6, 0]}>
            <sphereGeometry args={[1, 6, 6]} />
            <meshStandardMaterial color={i % 2 === 0 ? '#1a5a1a' : '#2a6a2a'} roughness={0.9} />
          </mesh>
        </group>
      ))}
      {/* Bench */}
      <group position={[3, -1, -3]} rotation={[0, -0.3, 0]}>
        <mesh position={[0, 0.35, 0]}>
          <boxGeometry args={[1.2, 0.05, 0.35]} />
          <meshStandardMaterial color="#6a4a14" roughness={0.85} />
        </mesh>
        <mesh position={[0, 0.6, -0.16]}>
          <boxGeometry args={[1.2, 0.4, 0.05]} />
          <meshStandardMaterial color="#6a4a14" roughness={0.85} />
        </mesh>
      </group>
      {/* Streetlamps */}
      <Streetlamp position={[-2, -1, -2]} />
      <Streetlamp position={[5, -1, 0]} />
    </>
  );
}

// ─── Alley: walls + lanterns ───
function AlleyEnvironment() {
  return (
    <>
      <color attach="background" args={['#0a0808']} />
      <ambientLight color="#221a10" intensity={0.3} />
      <pointLight color="#ffaa44" intensity={6} position={[-3, 3, -3]} distance={12} decay={2} />
      <pointLight color="#ff8833" intensity={4} position={[3, 2.5, -2]} distance={10} decay={2} />
      <pointLight color="#ffcc66" intensity={3} position={[0, 4, 1]} distance={15} decay={2} />
      <GroundPlane color="#3a3020" />
      <mesh position={[-5, 1, 0]}>
        <boxGeometry args={[0.2, 5, 12]} />
        <meshStandardMaterial color="#5a3010" roughness={0.95} />
      </mesh>
      <mesh position={[5, 1, 0]}>
        <boxGeometry args={[0.2, 5, 12]} />
        <meshStandardMaterial color="#4a2810" roughness={0.95} />
      </mesh>
      {[[-4.7, 3, -3], [4.7, 2.5, -2]].map(([x, y, z], i) => (
        <mesh key={i} position={[x, y, z]}>
          <sphereGeometry args={[0.1, 8, 8]} />
          <meshStandardMaterial color="#ffdd88" emissive="#ffaa44" emissiveIntensity={3} />
        </mesh>
      ))}
      <mesh position={[-3.5, -0.5, 2]}>
        <boxGeometry args={[0.5, 0.5, 0.5]} />
        <meshStandardMaterial color="#6a4a14" roughness={0.9} />
      </mesh>
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
