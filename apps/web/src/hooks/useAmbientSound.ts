import { useCallback, useEffect, useRef } from 'react';
import { ambientEngine } from '../audio/ambientEngine';
import { useUIStore } from '../stores/ui-store';
import type { PlaceTheme } from '@bubbles/shared';

/**
 * React hook for ambient soundscapes.
 *
 * Initialises the ambient engine on first user interaction and syncs
 * the enabled/volume state with the UI store.
 */
export function useAmbientSound(theme: PlaceTheme | undefined) {
  const isAmbientEnabled = useUIStore((s) => s.isAmbientEnabled);
  const ambientVolume = useUIStore((s) => s.ambientVolume);
  const initRef = useRef(false);

  // Ensure AudioContext is initialised on first user interaction
  const ensureInit = useCallback(() => {
    if (initRef.current) return;
    ambientEngine.init();
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

  // Sync enabled state
  useEffect(() => {
    ambientEngine.setEnabled(isAmbientEnabled);
  }, [isAmbientEnabled]);

  // Sync volume
  useEffect(() => {
    ambientEngine.setVolume(ambientVolume);
  }, [ambientVolume]);

  // Update theme when it changes
  useEffect(() => {
    if (!theme) return;
    if (initRef.current) {
      ambientEngine.setTheme(theme);
    }
  }, [theme]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      ambientEngine.stop();
    };
  }, []);
}
