import type { Place } from '@bubbles/shared';

/**
 * Prefer the server's principal-aware result. The display-name fallback only
 * supports cached responses from an older server that did not emit the flag.
 */
export function isPlaceOwnedByCurrentUser(
  place: Place,
  legacyAuthenticatedDisplayName?: string
): boolean {
  if (typeof place.isOwnedByCurrentUser === 'boolean') {
    return place.isOwnedByCurrentUser;
  }

  return Boolean(
    legacyAuthenticatedDisplayName &&
    place.createdBy === legacyAuthenticatedDisplayName
  );
}
