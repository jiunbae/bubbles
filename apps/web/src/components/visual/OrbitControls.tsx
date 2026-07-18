import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls as OrbitControlsImpl } from 'three/addons/controls/OrbitControls.js';
import type { MOUSE, TOUCH } from 'three';

interface OrbitControlsProps {
  makeDefault?: boolean;
  enablePan?: boolean;
  enableZoom?: boolean;
  minDistance?: number;
  maxDistance?: number;
  minPolarAngle?: number;
  maxPolarAngle?: number;
  autoRotate?: boolean;
  mouseButtons?: {
    LEFT?: MOUSE;
    MIDDLE?: MOUSE;
    RIGHT?: MOUSE;
  };
  touches?: {
    ONE?: TOUCH;
    TWO?: TOUCH;
  };
}

/** Focused R3F adapter for Three's official OrbitControls addon. */
export function OrbitControls({ makeDefault, ...props }: OrbitControlsProps) {
  const camera = useThree((state) => state.camera);
  const gl = useThree((state) => state.gl);
  const eventSource = useThree((state) => state.events.connected);
  const invalidate = useThree((state) => state.invalidate);
  const get = useThree((state) => state.get);
  const set = useThree((state) => state.set);
  const domElement = eventSource || gl.domElement;
  const controls = useMemo(() => new OrbitControlsImpl(camera), [camera]);

  useFrame(() => controls.update(), -1);

  useEffect(() => {
    const handleChange = () => invalidate();
    controls.domElement = domElement;
    controls.connect();
    controls.addEventListener('change', handleChange);

    return () => {
      controls.removeEventListener('change', handleChange);
      controls.dispose();
    };
  }, [controls, domElement, invalidate]);

  useEffect(() => {
    if (!makeDefault) return;

    const previous = get().controls;
    set({ controls });
    return () => set({ controls: previous });
  }, [controls, get, makeDefault, set]);

  return <primitive object={controls} enableDamping {...props} />;
}
