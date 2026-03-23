export const WS_PING_INTERVAL = 20000;
export const WS_STALE_TIMEOUT = 60000;
export const PLACE_INACTIVE_TIMEOUT = 30 * 60 * 1000; // 30 minutes
export const LOG_RETENTION_DAYS = 90;
export const MAX_PLACE_NAME_LENGTH = 50;
export const RATE_LIMITS = {
  authenticated: { blow: 300, pop: 300, createPlace: 20 },
  anonymous: { blow: 200, pop: 200, createPlace: 5 },
} as const;
