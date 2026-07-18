import type { Context, Next } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import { config } from '../config';
import {
  generateSessionId,
  signSession,
  verifySessionWithRotation,
  generateDisplayName,
} from '../utils/session';
import type { UserInfo } from '@bubbles/shared';
import { createOwnerId } from '../utils/ownership';
import { verifyJwtWithRotation } from '../utils/jwt';

export interface BubblesUser extends UserInfo {
  userId?: string;
}

export interface RequestUser extends BubblesUser {
  ownerId: string;
}

// Extend Hono's context variables
declare module 'hono' {
  interface ContextVariableMap {
    user: RequestUser;
  }
}

export async function authMiddleware(
  c: Context,
  next: Next
): Promise<void | Response> {
  let userId: string | undefined;
  let displayName: string | undefined;
  let isAuthenticated = false;

  // Try JWT auth from Authorization header
  const authHeader = c.req.header('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    try {
      const { payload } = await verifyJwtWithRotation(
        token,
        config.JWT_SECRET,
        config.JWT_SECRET_PREVIOUS
      );
      const subject = typeof payload.sub === 'string' ? payload.sub.trim() : '';
      if (subject) {
        userId = subject;
        const rawName =
          (payload.name as string) || (payload.username as string) || '';
        displayName = rawName
          .trim()
          .slice(0, 30)
          .replace(/[<>&"']/g, '')
          .replace(/[\x00-\x1f\x7f-\x9f]/g, '');
        isAuthenticated = true;
      }
    } catch {
      // Invalid token — fall through to anonymous
    }
  }

  // Session management via signed cookie
  let sessionId: string | undefined;
  const sessionCookie = getCookie(c, 'bubbles_session');

  if (sessionCookie) {
    const verified = await verifySessionWithRotation(
      sessionCookie,
      config.SESSION_SECRET,
      config.SESSION_SECRET_PREVIOUS
    );
    if (verified) {
      sessionId = verified.sessionId;
      if (verified.needsResign) {
        const signed = await signSession(sessionId, config.SESSION_SECRET);
        setCookie(c, 'bubbles_session', signed, {
          httpOnly: true,
          secure: config.IS_PRODUCTION,
          sameSite: config.IS_PRODUCTION ? 'None' : 'Lax',
          path: '/',
          maxAge: 30 * 24 * 60 * 60,
        });
      }
    }
  }

  if (!sessionId) {
    sessionId = generateSessionId();
    const signed = await signSession(sessionId, config.SESSION_SECRET);
    setCookie(c, 'bubbles_session', signed, {
      httpOnly: true,
      secure: config.IS_PRODUCTION,
      sameSite: config.IS_PRODUCTION ? 'None' : 'Lax',
      path: '/',
      maxAge: 30 * 24 * 60 * 60, // 30 days
    });
  }

  if (!displayName) {
    displayName = generateDisplayName(sessionId);
  }

  // Assign a deterministic color from sessionId
  const colorHash = sessionId
    .split('')
    .reduce((acc, ch) => ((acc << 5) - acc + ch.charCodeAt(0)) | 0, 0);
  const USER_COLORS = [
    '#FFB5C2',
    '#87CEEB',
    '#98FB98',
    '#DDA0DD',
    '#FFD700',
    '#FFDAB9',
    '#FF69B4',
    '#FFA07A',
  ];
  const color = USER_COLORS[Math.abs(colorHash) % USER_COLORS.length];

  const ownerId = await createOwnerId(
    { sessionId, userId, isAuthenticated },
    config.OWNER_ID_SECRET
  );

  c.set('user', {
    sessionId,
    userId,
    ownerId,
    displayName,
    isAuthenticated,
    color,
  });

  await next();
}
