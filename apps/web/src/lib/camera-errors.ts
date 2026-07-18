export interface CameraErrorMessage {
  key:
    | 'place.cameraAccessDenied'
    | 'place.cameraInUse'
    | 'place.cameraOverconstrained'
    | 'place.cameraNoDevice'
    | 'place.cameraError';
  fallback: string;
}

function errorName(error: unknown): string {
  if (
    error &&
    typeof error === 'object' &&
    'name' in error &&
    typeof error.name === 'string'
  ) {
    return error.name;
  }
  return '';
}

/**
 * Normalizes current and legacy getUserMedia error names so every recoverable
 * camera failure gives the user an actionable, localized next step.
 */
export function cameraErrorMessage(error: unknown): CameraErrorMessage {
  switch (errorName(error)) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
    case 'SecurityError':
      return {
        key: 'place.cameraAccessDenied',
        fallback:
          'Camera access denied. Please allow camera access in your browser settings.',
      };
    case 'NotReadableError':
    case 'TrackStartError':
      return {
        key: 'place.cameraInUse',
        fallback: 'Camera is in use by another application.',
      };
    case 'OverconstrainedError':
    case 'ConstraintNotSatisfiedError':
      return {
        key: 'place.cameraOverconstrained',
        fallback: 'Could not access the requested camera.',
      };
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return {
        key: 'place.cameraNoDevice',
        fallback: 'No camera was found on this device.',
      };
    default:
      return { key: 'place.cameraError', fallback: 'Camera error' };
  }
}
