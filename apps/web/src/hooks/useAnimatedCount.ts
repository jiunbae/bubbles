import { useEffect, useRef, useState } from 'react';

/**
 * Animates a number from its previous value to `target` over `duration` ms.
 * Uses easeOutCubic. Returns the current animated value (integer).
 */
export function useAnimatedCount(target: number, duration = 800): number {
  const [value, setValue] = useState(target);
  const prevRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const from = prevRef.current;
    prevRef.current = target;

    if (from === target) {
      setValue(target);
      return;
    }

    const start = performance.now();

    function tick(now: number) {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(from + (target - from) * eased));
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [target, duration]);

  return value;
}
