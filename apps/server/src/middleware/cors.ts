import { cors } from 'hono/cors';
import { config } from '../config';

const ALLOWED_ORIGINS = ['https://bubbles.jiun.dev', 'https://jiun.dev'];

export function isAllowedOrigin(origin: string): boolean {
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  if (config.CORS_ORIGINS.includes(origin)) return true;

  if (!config.IS_PRODUCTION) {
    try {
      const url = new URL(origin);
      if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
        return true;
      }
    } catch {
      // invalid URL
    }
  }

  return false;
}

export const corsMiddleware = cors({
  origin: (origin) => {
    if (!origin) return '';
    return isAllowedOrigin(origin) ? origin : '';
  },
  credentials: true,
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  exposeHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset', 'Retry-After'],
  maxAge: 86400,
});
