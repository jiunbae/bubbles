import { useEffect, useRef } from 'react';
import { showToast } from '@/components/shared/Toast';
import { useUIStore } from '@/stores/ui-store';
import i18n from '@/i18n';

/**
 * Renders a live camera feed as a full-screen background video.
 * Uses the rear camera on mobile (facingMode: 'environment').
 * Stops the media stream on unmount.
 */
export function CameraFeed() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function startCamera() {
      // Secure context check — getUserMedia requires HTTPS or localhost
      if (!navigator.mediaDevices?.getUserMedia) {
        if (!cancelled) {
          showToast(i18n.t('place.cameraPermissionDenied', 'Camera permission denied'), 'error');
          useUIStore.getState().setCameraMode(false);
        }
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch {
        if (!cancelled) {
          showToast(i18n.t('place.cameraPermissionDenied', 'Camera permission denied'), 'error');
          useUIStore.getState().setCameraMode(false);
        }
      }
    }

    startCamera();

    return () => {
      cancelled = true;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };
  }, []);

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        zIndex: 0,
      }}
    />
  );
}
