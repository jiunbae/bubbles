import { describe, expect, it } from 'bun:test';
import { SignJWT } from 'jose';
import { verifyJwtWithRotation } from '../utils/jwt';
import {
  signSession,
  verifySession,
  verifySessionWithRotation,
} from '../utils/session';

const currentJwtSecret = 'current-jwt-secret-for-rotation-tests';
const previousJwtSecret = 'previous-jwt-secret-for-rotation-tests';

async function jwt(secret: string, subject: string): Promise<string> {
  return new SignJWT({ sub: subject })
    .setProtectedHeader({ alg: 'HS256' })
    .sign(new TextEncoder().encode(secret));
}

describe('credential rotation', () => {
  it('accepts JWTs signed by the current or time-bounded previous key', async () => {
    const current = await jwt(currentJwtSecret, 'current-user');
    const previous = await jwt(previousJwtSecret, 'previous-user');

    expect(
      (
        await verifyJwtWithRotation(
          current,
          currentJwtSecret,
          previousJwtSecret
        )
      ).payload.sub
    ).toBe('current-user');
    expect(
      (
        await verifyJwtWithRotation(
          previous,
          currentJwtSecret,
          previousJwtSecret
        )
      ).payload.sub
    ).toBe('previous-user');
  });

  it('rejects JWTs that match neither rotation key', async () => {
    const unknown = await jwt('untrusted-secret', 'unknown-user');
    expect(
      verifyJwtWithRotation(unknown, currentJwtSecret, previousJwtSecret)
    ).rejects.toThrow();
  });

  it('marks previous-key sessions for transparent re-signing', async () => {
    const currentSessionSecret = 'current-session-secret';
    const previousSessionSecret = 'previous-session-secret';
    const sessionId = crypto.randomUUID();
    const previousCookie = await signSession(sessionId, previousSessionSecret);

    expect(
      await verifySessionWithRotation(
        previousCookie,
        currentSessionSecret,
        previousSessionSecret
      )
    ).toEqual({ sessionId, needsResign: true });

    const resignedCookie = await signSession(sessionId, currentSessionSecret);
    expect(
      await verifySessionWithRotation(
        resignedCookie,
        currentSessionSecret,
        previousSessionSecret
      )
    ).toEqual({ sessionId, needsResign: false });
  });

  it('rejects malformed and unknown session signatures', async () => {
    const cookie = await signSession(crypto.randomUUID(), 'unknown-secret');
    expect(await verifySession(cookie, 'current-session-secret')).toBeNull();
    expect(
      await verifySession('session.not-hex', 'current-session-secret')
    ).toBeNull();
  });
});
