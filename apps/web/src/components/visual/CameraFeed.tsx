import { useEffect, useRef } from 'react';
import { showToast } from '@/components/shared/Toast';
import { useUIStore } from '@/stores/ui-store';
import { Z_INDEX } from '@/lib/z-index';
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

      async function requestCamera(facingMode: string) {
        const w = window.screen.width;
        const h = window.screen.height;
        return navigator.mediaDevices.getUserMedia({
          video: {
            facingMode,
            width: { ideal: Math.max(w, h) },
            height: { ideal: Math.min(w, h) },
          },
          audio: false,
        });
      }

      try {
        // Constrain resolution to screen size to avoid 4K overhead on mobile
        let stream: MediaStream;
        try {
          stream = await requestCamera('environment');
        } catch (firstErr) {
          // If rear camera fails with OverconstrainedError, retry with front camera
          if (firstErr instanceof DOMException && firstErr.name === 'OverconstrainedError') {
            try {
              stream = await requestCamera('user');
            } catch {
              if (!cancelled) {
                showToast(i18n.t('place.cameraOverconstrained', 'Could not access the requested camera.'), 'error');
                useUIStore.getState().setCameraMode(false);
              }
              return;
            }
          } else {
            throw firstErr;
          }
        }

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
          let msg: string;
          if (err instanceof DOMException) {
            switch (err.name) {
              case 'NotAllowedError':
                msg = i18n.t('place.cameraAccessDenied', 'Camera access denied. Please allow camera access in your browser settings.');
                break;
              case 'NotReadableError':
                msg = i18n.t('place.cameraInUse', 'Camera is in use by another application.');
                break;
              default:
                msg = i18n.t('place.cameraError', 'Camera error');
            }
          } else {
            msg = i18n.t('place.cameraError', 'Camera error');
          }
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
        zIndex: Z_INDEX.CAMERA_FEED,
      }}
    />
  );
}
