import { describe, expect, it } from 'bun:test';
import { cameraErrorMessage } from '../lib/camera-errors';

describe('cameraErrorMessage', () => {
  it.each([
    ['NotAllowedError', 'place.cameraAccessDenied'],
    ['PermissionDeniedError', 'place.cameraAccessDenied'],
    ['SecurityError', 'place.cameraAccessDenied'],
    ['NotReadableError', 'place.cameraInUse'],
    ['TrackStartError', 'place.cameraInUse'],
    ['OverconstrainedError', 'place.cameraOverconstrained'],
    ['ConstraintNotSatisfiedError', 'place.cameraOverconstrained'],
    ['NotFoundError', 'place.cameraNoDevice'],
    ['DevicesNotFoundError', 'place.cameraNoDevice'],
  ])('maps %s to %s', (name, key) => {
    expect(cameraErrorMessage({ name }).key).toBe(key);
  });

  it('uses a generic localized error for unknown or malformed failures', () => {
    expect(cameraErrorMessage(new Error('boom')).key).toBe('place.cameraError');
    expect(cameraErrorMessage(null).key).toBe('place.cameraError');
  });
});
