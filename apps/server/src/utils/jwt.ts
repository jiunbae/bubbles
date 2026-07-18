import { jwtVerify, type JWTVerifyResult, type JWTPayload } from 'jose';

const encoder = new TextEncoder();

/**
 * Verify with the current signing key first, then a time-bounded previous key.
 * New tokens are still issued by jiun-api with only the current key.
 */
export async function verifyJwtWithRotation(
  token: string,
  currentSecret: string,
  previousSecret?: string
): Promise<JWTVerifyResult<JWTPayload>> {
  const secrets = [currentSecret];
  if (previousSecret && previousSecret !== currentSecret) {
    secrets.push(previousSecret);
  }

  let lastError: unknown;
  for (const secret of secrets) {
    try {
      return await jwtVerify(token, encoder.encode(secret), {
        algorithms: ['HS256'],
      });
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError ?? new Error('JWT verification failed');
}
