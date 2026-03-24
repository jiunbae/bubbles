import { useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import { useWebSocket } from '@/hooks/useWebSocket';

const THROTTLE_MS = 100;

/**
 * Sends the local user's normalized cursor position via WebSocket,
 * throttled to ~100ms to match server-side throttle.
 */
export function CursorSender() {
  const { pointer, gl } = useThree();
  const { send, connectionStatus } = useWebSocket();
  const lastSentRef = useRef(0);
  const lastXRef = useRef<number | null>(null);
  const lastYRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = gl.domElement;

    const onPointerMove = (e: PointerEvent) => {
      if (connectionStatus !== 'connected') return;

      const now = Date.now();
      if (now - lastSentRef.current < THROTTLE_MS) return;

      // Normalize to 0-1 range (screen coordinates)
      const rect = canvas.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top) / rect.height;

      // Skip if position hasn't meaningfully changed
      if (
        lastXRef.current !== null &&
        Math.abs(x - lastXRef.current) < 0.005 &&
        Math.abs(y - lastYRef.current!) < 0.005
      ) {
        return;
      }

      lastSentRef.current = now;
      lastXRef.current = x;
      lastYRef.current = y;

      send({ type: 'cursor', data: { x, y } });
    };

    canvas.addEventListener('pointermove', onPointerMove);
    return () => canvas.removeEventListener('pointermove', onPointerMove);
  }, [gl, send, connectionStatus]);

  return null;
}
