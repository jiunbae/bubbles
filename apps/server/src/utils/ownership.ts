const OWNER_ID_VERSION = 'v1';

export interface OwnershipIdentity {
  sessionId: string;
  userId?: string;
  isAuthenticated: boolean;
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
 * OWNER_ID_SECRET must remain stable for existing ownership records to match.
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
