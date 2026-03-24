import { createNoise3D, type NoiseFunction3D } from 'simplex-noise';
import type { BubbleSize } from '@bubbles/shared';
import { BUBBLE_LIFETIME } from '@bubbles/shared';

// ---------------------------------------------------------------------------
// Seeded PRNG (mulberry32) – fast, deterministic, 32-bit state
// ---------------------------------------------------------------------------

export function seededRandom(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Deterministic noise – seeded via mulberry32 so every client with the same
// room seed produces identical wind fields.
// ---------------------------------------------------------------------------

let _noiseSeed: number | undefined;
let _noise3D: NoiseFunction3D;

/**
 * Initialise (or re-initialise) the shared noise function with a given seed.
 * Call once when the room state is received.
 */
export function initNoise(seed: number): void {
  if (_noiseSeed === seed) return;
  _noiseSeed = seed;
  const rng = seededRandom(seed);
  _noise3D = createNoise3D(rng);
}

// Fallback: use an unseeded noise if initNoise was never called.
function getNoise(): NoiseFunction3D {
  if (!_noise3D) {
    _noise3D = createNoise3D();
  }
  return _noise3D;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BubblePhysicsState {
  position: [number, number, number];
  velocity: [number, number, number];
  scale: number;        // current visual scale (for grow/pop animations)
  wobblePhase: number;
  age: number;          // seconds since creation
  lifetime: number;     // total lifetime in seconds
  seed: number;         // per-bubble random seed
  size: BubbleSize;     // bubble size category
  isDead: boolean;
}

export interface PhysicsConfig {
  buoyancy: number;
  drag: number;
  windStrength: number;
  wobbleAmplitude: number;
  wobbleFrequency: number;
  maxHeight: number;
  maxRadius: number;
}

export const DEFAULT_CONFIG: PhysicsConfig = {
  buoyancy: 0.6,
  drag: 1.5,
  windStrength: 0.4,
  wobbleAmplitude: 0.04,
  wobbleFrequency: 2.5,
  maxHeight: 12.0,
  maxRadius: 10.0,
};

// Size to radius mapping
export const SIZE_RADIUS: Record<BubbleSize, number> = {
  S: 0.08,
  M: 0.15,
  L: 0.25,
};

// Max speed clamp
const MAX_SPEED = 2.0;
const WIND_SCALE = 0.4;

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createBubbleState(
  x: number,
  y: number,
  z: number,
  size: BubbleSize,
  seed: number,
): BubblePhysicsState {
  const rng = seededRandom(seed);
  const wobblePhase = rng() * Math.PI * 2;
  const lifetime = generateLifetime(size, seed);

  // Gentle initial velocity — slight drift like real soap bubbles
  const vx = (rng() - 0.5) * 0.5;
  const vy = 0.2 + rng() * 0.4; // gentle upward
  const vz = (rng() - 0.5) * 0.5;

  return {
    position: [x, y, z],
    velocity: [vx, vy, vz],
    scale: 1,
    wobblePhase,
    age: 0,
    lifetime,
    seed,
    size,
    isDead: false,
  };
}

// ---------------------------------------------------------------------------
// Physics update – fully deterministic given the same inputs
// ---------------------------------------------------------------------------

export function updateBubble(
  state: BubblePhysicsState,
  dt: number,
  globalTime: number,
  config: PhysicsConfig = DEFAULT_CONFIG,
): void {
  // Don't skip dead bubbles — let them continue drifting during pop animation
  // isDead is informational only; expiry is handled by timers

  const noise = getNoise();
  const radius = SIZE_RADIUS[state.size];
  const effectiveRadius = radius * state.scale;

  const px = state.position[0];
  const py = state.position[1];
  const pz = state.position[2];
  let vx = state.velocity[0];
  let vy = state.velocity[1];
  let vz = state.velocity[2];

  // 1. Buoyancy – constant upward force scaled by effective radius
  vy += config.buoyancy * effectiveRadius * dt;

  // 2. Quadratic drag opposing velocity
  const speed = Math.sqrt(vx * vx + vy * vy + vz * vz);
  if (speed > 0.001) {
    const dragMag = config.drag * speed * speed * dt;
    const dragFactor = Math.max(0, 1.0 - dragMag / speed);
    vx *= dragFactor;
    vy *= dragFactor;
    vz *= dragFactor;
  }

  // 3. Wind – 3D simplex noise sampled at position for X/Z, reduced for Y
  const windTime = globalTime * 0.15;
  const wx = noise(px * WIND_SCALE, py * WIND_SCALE, windTime) * config.windStrength;
  const wy =
    noise(px * WIND_SCALE + 100.0, py * WIND_SCALE, windTime) *
    config.windStrength *
    0.3;
  const wz =
    noise(px * WIND_SCALE, py * WIND_SCALE + 100.0, windTime) *
    config.windStrength;
  vx += wx * dt;
  vy += wy * dt;
  vz += wz * dt;

  // 4. Wobble – sinusoidal lateral oscillation using per-bubble phase
  const wobbleX =
    Math.sin(globalTime * config.wobbleFrequency + state.wobblePhase) *
    config.wobbleAmplitude;
  const wobbleZ =
    Math.cos(globalTime * config.wobbleFrequency * 1.3 + state.wobblePhase * 0.7) *
    config.wobbleAmplitude;
  vx += wobbleX;
  vz += wobbleZ;

  // Clamp speed
  const newSpeed = Math.sqrt(vx * vx + vy * vy + vz * vz);
  if (newSpeed > MAX_SPEED) {
    const s = MAX_SPEED / newSpeed;
    vx *= s;
    vy *= s;
    vz *= s;
  }

  // 5. Semi-implicit Euler integration (velocity updated first, then position)
  let newPx = px + vx * dt;
  let newPy = py + vy * dt;
  const newPz = pz + vz * dt;

  // Soft boundary push
  const boundaryForce = 0.5;
  const bounds = 6.0;
  if (Math.abs(newPx) > bounds) {
    vx -= Math.sign(newPx) * boundaryForce * dt;
  }
  if (Math.abs(newPz) > bounds) {
    vz -= Math.sign(newPz) * boundaryForce * dt;
  }
  // Ground bounce
  if (newPy < -0.5) {
    newPy = -0.5;
    vy = Math.abs(vy) * 0.3;
  }

  const newAge = state.age + dt;

  // 6. Death conditions
  state.position[0] = newPx;
  state.position[1] = newPy;
  state.position[2] = newPz;
  state.velocity[0] = vx;
  state.velocity[1] = vy;
  state.velocity[2] = vz;
  state.age = newAge;
  state.isDead =
    shouldNaturallyPop(newAge, state.lifetime, state.seed) ||
    isOutOfBounds(state.position, config);
}

// ---------------------------------------------------------------------------
// Lifetime generation – log-normal-ish distribution within size range
// ---------------------------------------------------------------------------

export function generateLifetime(size: BubbleSize, seed: number): number {
  const range = BUBBLE_LIFETIME[size];
  const rng = seededRandom(seed * 7 + 31); // offset seed to avoid correlation
  // Approximate log-normal: average two uniform samples for a bell-like curve
  const u1 = rng();
  const u2 = rng();
  const t = (u1 + u2) / 2; // roughly triangular, peaks at 0.5
  const lifetimeMs = range.min + t * (range.max - range.min);
  return lifetimeMs / 1000; // convert to seconds
}

// ---------------------------------------------------------------------------
// Natural pop check – deterministic stochastic model
// ---------------------------------------------------------------------------

export function shouldNaturallyPop(
  age: number,
  lifetime: number,
  seed: number,
): boolean {
  if (age >= lifetime) return true;

  const progress = age / lifetime;
  if (progress > 0.7) {
    // Deterministic per-frame probability using seeded hash of age
    // Quantise age to ~60 fps ticks so the check is frame-rate independent
    const tick = Math.floor(age * 60);
    const rng = seededRandom(seed * 1337 + tick);
    const popChance = ((progress - 0.7) / 0.3) * 0.02;
    return rng() < popChance;
  }

  return false;
}

// ---------------------------------------------------------------------------
// Legacy compatibility – the old BubbleState type used by BubbleMesh.tsx
// ---------------------------------------------------------------------------

export interface BubbleState {
  position: [number, number, number];
  velocity: [number, number, number];
  age: number;
  lifetime: number;
  radius: number;
  wobblePhase: number;
}

/**
 * Legacy overload: accepts old BubbleState (without seed/scale/isDead).
 * Returns the same shape so existing consumers keep working.
 */
export function updateBubbleLegacy(
  state: BubbleState,
  dt: number,
  globalTime: number,
): BubbleState {
  // Convert to new state, update, then convert back
  const full: BubblePhysicsState = {
    position: state.position,
    velocity: state.velocity,
    scale: 1,
    wobblePhase: state.wobblePhase,
    age: state.age,
    lifetime: state.lifetime,
    seed: 0,
    size: 'M',
    isDead: false,
  };
  updateBubble(full, dt, globalTime);
  return {
    position: full.position,
    velocity: full.velocity,
    age: full.age,
    lifetime: full.lifetime,
    radius: state.radius,
    wobblePhase: full.wobblePhase,
  };
}

// ---------------------------------------------------------------------------
// Bounds check
// ---------------------------------------------------------------------------

export function isOutOfBounds(
  position: [number, number, number],
  config: PhysicsConfig = DEFAULT_CONFIG,
): boolean {
  const [x, y, z] = position;
  if (y > config.maxHeight) return true;
  const xzDist = Math.sqrt(x * x + z * z);
  if (xzDist > config.maxRadius) return true;
  return false;
}
