import { useCallback, useEffect, useRef } from 'react';
import { SoundEngine } from '../audio/soundEngine';
import { useUIStore } from '../stores/ui-store';
import type { BubbleSize } from '@bubbles/shared';

// Singleton engine shared across all hook consumers
const engine = new SoundEngine();

/**
 * React hook for the sound engine.
 *
 * Initialises the AudioContext on the first user interaction and syncs the
 * enabled state with the UI store's `isSoundEnabled` flag.
 */
export function useSound() {
  const isSoundEnabled = useUIStore((s) => s.isSoundEnabled);
  const initRef = useRef(false);

  // Sync enabled state with store
  useEffect(() => {
    engine.setEnabled(isSoundEnabled);
  }, [isSoundEnabled]);

  // Ensure AudioContext is initialised on first user interaction
  const ensureInit = useCallback(() => {
    if (initRef.current) return;
    engine.init();
    initRef.current = true;
  }, []);

  // Register a one-time interaction listener to bootstrap AudioContext
  useEffect(() => {
    const handler = () => {
      ensureInit();
      window.removeEventListener('pointerdown', handler);
      window.removeEventListener('keydown', handler);
    };
    window.addEventListener('pointerdown', handler, { once: true });
    window.addEventListener('keydown', handler, { once: true });
    return () => {
      window.removeEventListener('pointerdown', handler);
      window.removeEventListener('keydown', handler);
    };
  }, [ensureInit]);

  // Clean up on unmount (of the last consumer – since engine is a singleton
  // this is a best-effort cleanup; in practice it lives for the app lifetime)
  useEffect(() => {
    return () => {
      // Don't dispose the singleton; it should persist across route changes
    };
  }, []);

  const playBlow = useCallback((size: BubbleSize) => {
    ensureInit();
    engine.playBlow(size);
  }, [ensureInit]);

  const stopBlow = useCallback(() => {
    engine.stopBlow();
  }, []);

  const playPop = useCallback((size: BubbleSize, isOwn: boolean) => {
    ensureInit();
    engine.playPop(size, isOwn);
  }, [ensureInit]);

  const playRelease = useCallback(() => {
    ensureInit();
    engine.playRelease();
  }, [ensureInit]);

  const playJoin = useCallback(() => {
    ensureInit();
    engine.playJoin();
  }, [ensureInit]);

  const setEnabled = useCallback((enabled: boolean) => {
    engine.setEnabled(enabled);
  }, []);

  const setVolume = useCallback((volume: number) => {
    engine.setVolume(volume);
  }, []);

  return {
    playBlow,
    stopBlow,
    playPop,
    playRelease,
    playJoin,
    setEnabled,
    setVolume,
  };
}
