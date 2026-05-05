import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

const _dir = new THREE.Vector3();
const _target = new THREE.Vector3();

export function BubbleWandCursor() {
  const groupRef = useRef<THREE.Group>(null);
  const targetRef = useRef(new THREE.Vector3());
  const { camera, raycaster, pointer } = useThree();

  // Recalculate 3D target only when pointer actually moves
  useEffect(() => {
    raycaster.setFromCamera(pointer, camera);
    _dir.copy(raycaster.ray.direction).normalize();
    _target.copy(raycaster.ray.origin).addScaledVector(_dir, 5);
    targetRef.current.copy(_target);
  }, [pointer.x, pointer.y, camera, raycaster]);

  // Per-frame: lerp smoothing only
  useFrame(() => {
    const g = groupRef.current;
    if (!g) return;
    g.position.lerp(targetRef.current, 0.2);
    g.lookAt(camera.position);
  });

  return (
    <group ref={groupRef}>
      <mesh>
        <torusGeometry args={[0.2, 0.015, 8, 20]} />
        <meshStandardMaterial
          color="#ccddff"
          emissive="#6688cc"
          emissiveIntensity={0.5}
          transparent
          opacity={0.5}
        />
      </mesh>
      <mesh position={[0, -0.35, 0]}>
        <cylinderGeometry args={[0.012, 0.016, 0.4, 6]} />
        <meshStandardMaterial color="#aa8855" transparent opacity={0.4} />
      </mesh>
      <mesh>
        <circleGeometry args={[0.18, 12]} />
        <meshStandardMaterial
          color="#aaccff"
          emissive="#4488cc"
          emissiveIntensity={0.2}
          transparent
          opacity={0.1}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}
