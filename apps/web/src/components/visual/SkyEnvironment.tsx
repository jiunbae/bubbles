import { useMemo } from 'react';
import { Environment } from '@react-three/drei';
import * as THREE from 'three';
import type { PlaceTheme } from '@bubbles/shared';

interface SkyEnvironmentProps {
  theme?: PlaceTheme;
}

// Shared subtle ground plane
function GroundPlane({ color = '#3a3a4a' }: { color?: string }) {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        uniforms: {
          u_color: { value: new THREE.Color(color) },
        },
        vertexShader: `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform vec3 u_color;
          varying vec2 vUv;
          void main() {
            float dist = length(vUv - vec2(0.5));
            float alpha = smoothstep(0.5, 0.15, dist) * 0.25;
            vec3 c = u_color;
            // Subtle grid
            vec2 grid = abs(fract(vUv * 20.0 - 0.5) - 0.5);
            float line = min(grid.x, grid.y);
            float gridAlpha = smoothstep(0.0, 0.03, line);
            c = mix(c + vec3(0.06), c, gridAlpha);
            gl_FragColor = vec4(c, alpha);
          }
        `,
      }),
    [color],
  );

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1, 0]} material={material}>
      <planeGeometry args={[30, 30]} />
    </mesh>
  );
}

// ─── Rooftop: simple railing + AC unit, no background image ───
function RooftopEnvironment() {
  return (
    <>
      <Environment preset="sunset" background={false} />
      <color attach="background" args={['#1a1a2e']} />
      <directionalLight color="#ffa54f" intensity={2.5} position={[8, 6, 3]} />
      <directionalLight color="#87ceeb" intensity={0.6} position={[-5, 4, -5]} />
      <GroundPlane color="#4a4a5a" />
      {/* Railing posts */}
      {[-6, -3, 0, 3, 6].map((x) => (
        <mesh key={x} position={[x, 0, -6]}>
          <boxGeometry args={[0.06, 1.5, 0.06]} />
          <meshStandardMaterial color="#777" metalness={0.7} roughness={0.3} />
        </mesh>
      ))}
      {/* Top railing bar */}
      <mesh position={[0, 0.7, -6]}>
        <boxGeometry args={[13, 0.04, 0.04]} />
        <meshStandardMaterial color="#666" metalness={0.7} roughness={0.3} />
      </mesh>
      {/* AC unit */}
      <mesh position={[5, -0.5, -4]}>
        <boxGeometry args={[1, 0.7, 0.7]} />
        <meshStandardMaterial color="#666" roughness={0.8} />
      </mesh>
    </>
  );
}

// ─── Park: trees + bench, no background image ───
function ParkEnvironment() {
  return (
    <>
      <Environment preset="park" background={false} />
      <color attach="background" args={['#0e1a0e']} />
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
    </>
  );
}

// ─── Alley: walls + lanterns, no background image ───
function AlleyEnvironment() {
  return (
    <>
      <Environment preset="night" background={false} />
      <color attach="background" args={['#0a0808']} />
      {/* Warm lantern lights */}
      <pointLight color="#ffaa44" intensity={6} position={[-3, 3, -3]} distance={12} decay={2} />
      <pointLight color="#ff8833" intensity={4} position={[3, 2.5, -2]} distance={10} decay={2} />
      <pointLight color="#ffcc66" intensity={3} position={[0, 4, 1]} distance={15} decay={2} />
      <GroundPlane color="#3a3020" />
      {/* Left wall */}
      <mesh position={[-5, 1, 0]}>
        <boxGeometry args={[0.2, 5, 12]} />
        <meshStandardMaterial color="#5a3010" roughness={0.95} />
      </mesh>
      {/* Right wall */}
      <mesh position={[5, 1, 0]}>
        <boxGeometry args={[0.2, 5, 12]} />
        <meshStandardMaterial color="#4a2810" roughness={0.95} />
      </mesh>
      {/* Lantern glow spheres */}
      {[[-4.7, 3, -3], [4.7, 2.5, -2]].map(([x, y, z], i) => (
        <mesh key={i} position={[x, y, z]}>
          <sphereGeometry args={[0.1, 8, 8]} />
          <meshStandardMaterial color="#ffdd88" emissive="#ffaa44" emissiveIntensity={3} />
        </mesh>
      ))}
      {/* Crate */}
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
