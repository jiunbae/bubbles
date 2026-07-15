import { describe, expect, it } from 'bun:test';
import {
  BUBBLE_COLORS,
  BUBBLE_LIFETIME,
  PLACE_THEMES,
  RATE_LIMITS,
} from '../src';

describe('shared product constraints', () => {
  it('defines unique valid bubble colors', () => {
    expect(new Set(BUBBLE_COLORS).size).toBe(BUBBLE_COLORS.length);
    for (const color of BUBBLE_COLORS) {
      expect(color).toMatch(/^#[0-9A-F]{6}$/);
    }
  });

  it('keeps every bubble lifetime range positive and ordered', () => {
    for (const lifetime of Object.values(BUBBLE_LIFETIME)) {
      expect(lifetime.min).toBeGreaterThan(0);
      expect(lifetime.max).toBeGreaterThan(lifetime.min);
    }
  });

  it('keeps place theme identifiers unique', () => {
    const values = PLACE_THEMES.map((theme) => theme.value);
    expect(new Set(values).size).toBe(values.length);
  });

  it('does not give anonymous clients higher mutation limits', () => {
    expect(RATE_LIMITS.anonymous.blow).toBeLessThanOrEqual(
      RATE_LIMITS.authenticated.blow
    );
    expect(RATE_LIMITS.anonymous.pop).toBeLessThanOrEqual(
      RATE_LIMITS.authenticated.pop
    );
    expect(RATE_LIMITS.anonymous.createPlace).toBeLessThanOrEqual(
      RATE_LIMITS.authenticated.createPlace
    );
  });
});
