export const JIUN_API_URL = import.meta.env.VITE_JIUN_API_URL || 'https://api.jiun.dev';

export function redirectToOAuth(provider: string): void {
  const redirectUri = `${window.location.origin}/auth/callback`;
  window.location.href = `${JIUN_API_URL}/auth/${provider}?redirect_uri=${encodeURIComponent(redirectUri)}`;
}
