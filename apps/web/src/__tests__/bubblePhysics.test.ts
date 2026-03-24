import { describe, test, expect } from 'bun:test';
import {
  seededRandom,
  createBubbleState,
  generateLifetime,
  shouldNaturallyPop,
  SIZE_RADIUS,
} from '../physics/bubblePhysics';

describe('seededRandom', () => {
  test('produces deterministic sequence for the same seed', () => {
    const rng1 = seededRandom(12345);
    const rng2 = seededRandom(12345);

    const seq1 = Array.from({ length: 10 }, () => rng1());
    const seq2 = Array.from({ length: 10 }, () => rng2());

    expect(seq1).toEqual(seq2);
  });

  test('produces different sequences for different seeds', () => {
    const rng1 = seededRandom(1);
    const rng2 = seededRandom(2);

    const v1 = rng1();
    const v2 = rng2();

    expect(v1).not.toEqual(v2);
  });

  test('values are in [0, 1) range', () => {
    const rng = seededRandom(42);
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('createBubbleState', () => {
  test('returns state with correct position', () => {
    const state = createBubbleState(1, 2, 3, 'M', 100);
    expect(state.position).toEqual([1, 2, 3]);
  });

  test('initializes age to 0 and isDead to false', () => {
    const state = createBubbleState(0, 0, 0, 'S', 42);
    expect(state.age).toBe(0);
    expect(state.isDead).toBe(false);
  });

  test('stores the size on the state', () => {
    const stateS = createBubbleState(0, 0, 0, 'S', 1);
    const stateL = createBubbleState(0, 0, 0, 'L', 1);
    expect(stateS.size).toBe('S');
    expect(stateL.size).toBe('L');
  });

  test('stores the seed on the state', () => {
    const state = createBubbleState(0, 0, 0, 'M', 999);
    expect(state.seed).toBe(999);
  });

  test('generates positive upward velocity', () => {
    const state = createBubbleState(0, 0, 0, 'M', 55);
    expect(state.velocity[1]).toBeGreaterThan(0);
  });

  test('is deterministic for the same inputs', () => {
    const a = createBubbleState(1, 2, 3, 'M', 42);
    const b = createBubbleState(1, 2, 3, 'M', 42);
    expect(a.velocity).toEqual(b.velocity);
    expect(a.wobblePhase).toBe(b.wobblePhase);
    expect(a.lifetime).toBe(b.lifetime);
  });
});

describe('generateLifetime', () => {
  test('is deterministic for the same size and seed', () => {
    const a = generateLifetime('M', 100);
    const b = generateLifetime('M', 100);
    expect(a).toBe(b);
  });

  test('returns a positive value in seconds', () => {
    const lifetime = generateLifetime('S', 42);
    expect(lifetime).toBeGreaterThan(0);
  });

  test('different seeds produce different lifetimes', () => {
    const a = generateLifetime('L', 1);
    const b = generateLifetime('L', 2);
    // They could theoretically be equal, but extremely unlikely
    expect(a).not.toBe(b);
  });
});

describe('shouldNaturallyPop', () => {
  test('returns true when age >= lifetime', () => {
    expect(shouldNaturallyPop(10, 10, 1)).toBe(true);
    expect(shouldNaturallyPop(11, 10, 1)).toBe(true);
  });

  test('returns false when age is well below 70% of lifetime', () => {
    expect(shouldNaturallyPop(1, 100, 1)).toBe(false);
    expect(shouldNaturallyPop(50, 100, 1)).toBe(false);
  });

  test('is deterministic for the same inputs', () => {
    const result1 = shouldNaturallyPop(8.5, 10, 42);
    const result2 = shouldNaturallyPop(8.5, 10, 42);
    expect(result1).toBe(result2);
  });
});

describe('SIZE_RADIUS', () => {
  test('S < M < L', () => {
    expect(SIZE_RADIUS['S']).toBeLessThan(SIZE_RADIUS['M']);
    expect(SIZE_RADIUS['M']).toBeLessThan(SIZE_RADIUS['L']);
  });
});
