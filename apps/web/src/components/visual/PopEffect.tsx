import { useRef, useMemo, useCallback, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface PopParticle {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  color: THREE.Color;
  life: number;
  maxLife: number;
}

interface PopEvent {
  id: number;
  particles: PopParticle[];
  startTime: number;
}

const POP_DURATION = 0.6; // longer for visibility
const PARTICLE_COUNT_MIN = 10;
const PARTICLE_COUNT_MAX = 16;
const GRAVITY = -3.0; // slower fall

// Shader for point particles
const particleVertexShader = `
  attribute float a_life;
  attribute vec3 a_color;
  varying float vLife;
  varying vec3 vColor;

  void main() {
    vLife = a_life;
    vColor = a_color;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    // Size decreases as particle fades
    gl_PointSize = (14.0 * a_life) * (300.0 / -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const particleFragmentShader = `
  varying float vLife;
  varying vec3 vColor;

  void main() {
    // Circular particle shape
    vec2 center = gl_PointCoord - vec2(0.5);
    float dist = length(center);
    if (dist > 0.5) discard;

    // Soft edge
    float alpha = smoothstep(0.5, 0.1, dist) * vLife * 1.5;
    // Brighter center glow
    float glow = smoothstep(0.3, 0.0, dist) * vLife * 0.5;
    gl_FragColor = vec4(vColor + glow, min(1.0, alpha));
  }
`;

const MAX_PARTICLES = PARTICLE_COUNT_MAX * 8; // support up to 8 simultaneous pops

export function usePopEffect() {
  const [pops, setPops] = useState<PopEvent[]>([]);
  const idRef = useRef(0);

  const triggerPop = useCallback(
    (position: THREE.Vector3, color: THREE.Color, size: number) => {
      const count =
        PARTICLE_COUNT_MIN +
        Math.floor(
          Math.random() * (PARTICLE_COUNT_MAX - PARTICLE_COUNT_MIN + 1),
        );

      const particles: PopParticle[] = [];
      for (let i = 0; i < count; i++) {
        // Random outward direction on sphere
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        const speed = 2.0 + Math.random() * 3.0;

        const dir = new THREE.Vector3(
          Math.sin(phi) * Math.cos(theta),
          Math.sin(phi) * Math.sin(theta),
          Math.cos(phi),
        );

        // Vary color slightly per particle
        const particleColor = color.clone();
        particleColor.offsetHSL(
          (Math.random() - 0.5) * 0.1,
          0,
          (Math.random() - 0.5) * 0.2,
        );

        particles.push({
          position: position.clone().add(dir.clone().multiplyScalar(size * 0.5)),
          velocity: dir.multiplyScalar(speed),
          color: particleColor,
          life: 1.0,
          maxLife: POP_DURATION * (0.7 + Math.random() * 0.3),
        });
      }

      const id = idRef.current++;
      setPops((prev) => [...prev, { id, particles, startTime: -1 }]);
    },
    [],
  );

  return { pops, setPops, triggerPop };
}

interface PopEffectRendererProps {
  pops: PopEvent[];
  setPops: React.Dispatch<React.SetStateAction<PopEvent[]>>;
}

export function PopEffectRenderer({ pops, setPops }: PopEffectRendererProps) {
  const pointsRef = useRef<THREE.Points>(null);

  const { positions, colors, lives } = useMemo(() => {
    return {
      positions: new Float32Array(MAX_PARTICLES * 3),
      colors: new Float32Array(MAX_PARTICLES * 3),
      lives: new Float32Array(MAX_PARTICLES),
    };
  }, []);

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('a_color', new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('a_life', new THREE.BufferAttribute(lives, 1));
    return geo;
  }, [positions, colors, lives]);

  const material = useMemo(() => {
    return new THREE.ShaderMaterial({
      vertexShader: particleVertexShader,
      fragmentShader: particleFragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
  }, []);

  useFrame((_, delta) => {
    if (pops.length === 0) return;

    let particleIdx = 0;
    const toRemove: number[] = [];

    for (const pop of pops) {
      let allDead = true;

      for (const p of pop.particles) {
        // Update physics
        p.velocity.y += GRAVITY * delta;
        p.position.add(p.velocity.clone().multiplyScalar(delta));
        p.life -= delta / p.maxLife;

        if (p.life > 0) {
          allDead = false;
          if (particleIdx < MAX_PARTICLES) {
            positions[particleIdx * 3] = p.position.x;
            positions[particleIdx * 3 + 1] = p.position.y;
            positions[particleIdx * 3 + 2] = p.position.z;
            colors[particleIdx * 3] = p.color.r;
            colors[particleIdx * 3 + 1] = p.color.g;
            colors[particleIdx * 3 + 2] = p.color.b;
            lives[particleIdx] = Math.max(0, p.life);
            particleIdx++;
          }
        }
      }

      if (allDead) {
        toRemove.push(pop.id);
      }
    }

    // Zero out remaining
    for (let i = particleIdx; i < MAX_PARTICLES; i++) {
      lives[i] = 0;
    }

    geometry.attributes.position.needsUpdate = true;
    (geometry.attributes.a_color as THREE.BufferAttribute).needsUpdate = true;
    (geometry.attributes.a_life as THREE.BufferAttribute).needsUpdate = true;
    geometry.setDrawRange(0, particleIdx);

    if (toRemove.length > 0) {
      setPops((prev) => prev.filter((p) => !toRemove.includes(p.id)));
    }
  });

  if (pops.length === 0) return null;

  return <points ref={pointsRef} geometry={geometry} material={material} />;
}
