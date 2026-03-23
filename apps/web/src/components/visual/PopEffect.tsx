import { useRef, useMemo, useCallback, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface PopParticle {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  color: THREE.Color;
  life: number;
  maxLife: number;
  size: number; // each droplet has slightly different size
}

interface PopEvent {
  id: number;
  particles: PopParticle[];
  startTime: number;
}

const POP_DURATION = 0.4;
const PARTICLE_COUNT_MIN = 6;
const PARTICLE_COUNT_MAX = 10;
const GRAVITY = -5.0; // real gravity feel — droplets fall quickly

// Shader: small transparent water droplets, not glowing neon
const particleVertexShader = `
  attribute float a_life;
  attribute float a_size;
  attribute vec3 a_color;
  varying float vLife;
  varying vec3 vColor;

  void main() {
    vLife = a_life;
    vColor = a_color;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = a_size * a_life * (200.0 / -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const particleFragmentShader = `
  varying float vLife;
  varying vec3 vColor;

  void main() {
    vec2 center = gl_PointCoord - vec2(0.5);
    float dist = length(center);
    if (dist > 0.5) discard;

    // Water droplet look: transparent edge, slight refraction highlight
    float edge = smoothstep(0.5, 0.35, dist);
    float highlight = smoothstep(0.25, 0.1, length(center - vec2(-0.15, -0.15))) * 0.4;

    // Fade with life — droplets become transparent as they fall
    float alpha = edge * vLife * 0.6;

    // Subtle tinted water color (mostly white/clear with hint of bubble color)
    vec3 dropletColor = mix(vec3(0.9, 0.95, 1.0), vColor, 0.3) + highlight;

    gl_FragColor = vec4(dropletColor, alpha);
  }
`;

const MAX_PARTICLES = PARTICLE_COUNT_MAX * 8;

export function usePopEffect() {
  const [pops, setPops] = useState<PopEvent[]>([]);
  const idRef = useRef(0);

  const triggerPop = useCallback(
    (position: THREE.Vector3, color: THREE.Color, size: number) => {
      const count =
        PARTICLE_COUNT_MIN +
        Math.floor(Math.random() * (PARTICLE_COUNT_MAX - PARTICLE_COUNT_MIN + 1));

      const particles: PopParticle[] = [];
      for (let i = 0; i < count; i++) {
        // Droplets spread outward in a ring (like real bubble pop)
        const theta = Math.random() * Math.PI * 2;
        // Mostly horizontal spread, slight vertical
        const elevation = (Math.random() - 0.3) * 0.6;
        const speed = 0.8 + Math.random() * 1.5; // gentle, not explosive

        const dir = new THREE.Vector3(
          Math.cos(theta) * Math.cos(elevation),
          Math.sin(elevation) + 0.2, // slight upward then gravity takes over
          Math.sin(theta) * Math.cos(elevation),
        );

        // Droplet color: mostly clear/white with a tint from bubble
        const dropletColor = color.clone();
        dropletColor.lerp(new THREE.Color(0.9, 0.95, 1.0), 0.6); // wash out to water color
        dropletColor.offsetHSL(0, -0.3, (Math.random() - 0.5) * 0.1);

        particles.push({
          position: position.clone().add(dir.clone().multiplyScalar(size * 0.3)),
          velocity: dir.multiplyScalar(speed),
          color: dropletColor,
          life: 1.0,
          maxLife: POP_DURATION * (0.5 + Math.random() * 0.5),
          size: 3 + Math.random() * 5, // small droplets
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

  const { positions, colors, lives, sizes } = useMemo(() => {
    return {
      positions: new Float32Array(MAX_PARTICLES * 3),
      colors: new Float32Array(MAX_PARTICLES * 3),
      lives: new Float32Array(MAX_PARTICLES),
      sizes: new Float32Array(MAX_PARTICLES),
    };
  }, []);

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('a_color', new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('a_life', new THREE.BufferAttribute(lives, 1));
    geo.setAttribute('a_size', new THREE.BufferAttribute(sizes, 1));
    return geo;
  }, [positions, colors, lives, sizes]);

  const material = useMemo(() => {
    return new THREE.ShaderMaterial({
      vertexShader: particleVertexShader,
      fragmentShader: particleFragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending, // NOT additive — natural transparency
    });
  }, []);

  useFrame((_, delta) => {
    if (pops.length === 0) return;

    let particleIdx = 0;
    const toRemove: number[] = [];

    for (const pop of pops) {
      let allDead = true;

      for (const p of pop.particles) {
        p.velocity.y += GRAVITY * delta;
        // Air resistance — droplets slow down
        p.velocity.multiplyScalar(1 - 2.0 * delta);
        p.position.addScaledVector(p.velocity, delta);
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
            sizes[particleIdx] = p.size;
            particleIdx++;
          }
        }
      }

      if (allDead) {
        toRemove.push(pop.id);
      }
    }

    for (let i = particleIdx; i < MAX_PARTICLES; i++) {
      lives[i] = 0;
    }

    geometry.attributes.position.needsUpdate = true;
    (geometry.attributes.a_color as THREE.BufferAttribute).needsUpdate = true;
    (geometry.attributes.a_life as THREE.BufferAttribute).needsUpdate = true;
    (geometry.attributes.a_size as THREE.BufferAttribute).needsUpdate = true;
    geometry.setDrawRange(0, particleIdx);

    if (toRemove.length > 0) {
      setPops((prev) => prev.filter((p) => !toRemove.includes(p.id)));
    }
  });

  if (pops.length === 0) return null;

  return <points ref={pointsRef} geometry={geometry} material={material} />;
}
