import { useEffect, useRef } from 'react';
import { showToast } from '@/components/shared/Toast';
import { useUIStore } from '@/stores/ui-store';
import i18n from '@/i18n';

/**
 * Renders a live camera feed as a full-screen background video.
 * Uses the rear camera on mobile (facingMode: 'environment').
 * Stops the media stream on unmount or if the track ends unexpectedly.
 */
export function CameraFeed() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    let cancelled = false;

    function stopStream() {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    }

    async function startCamera() {
      // Secure context check — getUserMedia requires HTTPS or localhost
      if (!navigator.mediaDevices?.getUserMedia) {
        if (!cancelled) {
          showToast(i18n.t('place.cameraNotAvailable', 'Camera not available (HTTPS required)'), 'error');
          useUIStore.getState().setCameraMode(false);
        }
        return;
      }

      try {
        // Constrain resolution to screen size to avoid 4K overhead on mobile
        const w = window.screen.width;
        const h = window.screen.height;
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'environment',
            width: { ideal: Math.max(w, h) },
            height: { ideal: Math.min(w, h) },
          },
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

        // Handle unexpected track end (device disconnected, permission revoked)
        const videoTrack = stream.getVideoTracks()[0];
        if (videoTrack) {
          videoTrack.onended = () => {
            if (!cancelled) {
              showToast(i18n.t('place.cameraDisconnected', 'Camera disconnected'), 'error');
              useUIStore.getState().setCameraMode(false);
            }
          };
        }
      } catch (err) {
        if (!cancelled) {
          const msg = err instanceof DOMException && err.name === 'NotAllowedError'
            ? i18n.t('place.cameraPermissionDenied', 'Camera permission denied')
            : i18n.t('place.cameraError', 'Camera error');
          showToast(msg, 'error');
          useUIStore.getState().setCameraMode(false);
        }
      }
    }

    startCamera();

    return () => {
      cancelled = true;
      stopStream();
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
