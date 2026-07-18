const OWNER_ID_VERSION = 'v1';

export interface OwnershipIdentity {
  sessionId: string;
  userId?: string;
  isAuthenticated: boolean;
}

export interface OwnershipIds {
  current: string;
  previous?: string;
}

function ownershipSubject(user: OwnershipIdentity): string {
  if (user.isAuthenticated && user.userId) {
    return `account:${user.userId}`;
  }

  return `session:${user.sessionId}`;
}

/**
 * Produces a stable, pseudonymous ownership identifier without exposing the
 * OAuth subject or the signed-cookie session identifier in public place DTOs.
 * During a key rotation, callers can derive the same identifier with the
 * previous secret via createOwnershipIds and migrate matching records.
 */
export async function createOwnerId(
  user: OwnershipIdentity,
  secret: string
): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(
      `bubbles-owner:${OWNER_ID_VERSION}:${ownershipSubject(user)}`
    )
  );
  const digest = Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');

  return `owner_${OWNER_ID_VERSION}_${digest}`;
}

/**
 * Derives the current opaque owner ID and, during a rotation window, the ID
 * produced by the previous secret. Equal or empty previous secrets are
 * ignored so callers have one unambiguous current identifier.
 */
export async function createOwnershipIds(
  user: OwnershipIdentity,
  currentSecret: string,
  previousSecret?: string
): Promise<OwnershipIds> {
  const currentPromise = createOwnerId(user, currentSecret);

  if (!previousSecret || previousSecret === currentSecret) {
    return { current: await currentPromise };
  }

  const [current, previous] = await Promise.all([
    currentPromise,
    createOwnerId(user, previousSecret),
  ]);
  return { current, previous };
}
