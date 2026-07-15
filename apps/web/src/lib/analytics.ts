const GA_MEASUREMENT_ID = 'G-8JQSR962RQ';
const GA_SCRIPT_ID = 'bubbles-ga4-script';
const GA_DISABLE_PROPERTY = `ga-disable-${GA_MEASUREMENT_ID}`;
const ALLOWED_ERROR_TYPES = new Set([
  'Error',
  'EvalError',
  'RangeError',
  'ReferenceError',
  'SyntaxError',
  'TypeError',
  'URIError',
  'AggregateError',
]);

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  }
}

let analyticsEnabled = false;

export function normalizeAnalyticsErrorType(errorName: unknown): string {
  return typeof errorName === 'string' && ALLOWED_ERROR_TYPES.has(errorName)
    ? errorName
    : 'Error';
}

export function sanitizeAnalyticsPath(path: string): string {
  const sanitized = path.split(/[?#]/, 1)[0] || '/';
  return sanitized.startsWith('/') && !sanitized.startsWith('//')
    ? sanitized
    : '/';
}

export function analyticsPageFields(path: string, origin: string) {
  const pagePath = sanitizeAnalyticsPath(path);
  return {
    page_path: pagePath,
    page_location: `${origin}${pagePath}`,
    // Document titles may contain a user-created room name. Keep analytics
    // metadata bounded to a non-user-controlled product label.
    page_title: 'Bubbles',
  };
}

function setGaDisabled(disabled: boolean) {
  (window as unknown as Record<string, unknown>)[GA_DISABLE_PROPERTY] =
    disabled;
}

function clearGaCookies() {
  const cookieNames = document.cookie
    .split(';')
    .map((cookie) => cookie.split('=', 1)[0]?.trim())
    .filter(
      (name): name is string =>
        Boolean(name) && (name === '_ga' || name.startsWith('_ga_'))
    );
  if (cookieNames.length === 0) return;

  const hostname = window.location.hostname;
  const hostnameParts = hostname.split('.');
  const candidateDomains = hostnameParts
    .map((_, index) => hostnameParts.slice(index).join('.'))
    .filter((domain) => domain.includes('.'));
  const secureAttribute =
    window.location.protocol === 'https:' ? '; Secure' : '';

  for (const name of cookieNames) {
    document.cookie = `${name}=; Max-Age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Lax${secureAttribute}`;
    for (const domain of candidateDomains) {
      document.cookie = `${name}=; Max-Age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=.${domain}; SameSite=Lax${secureAttribute}`;
    }
  }
}

export function setAnalyticsEnabled(enabled: boolean) {
  if (typeof document === 'undefined') return;

  if (!enabled) {
    analyticsEnabled = false;
    setGaDisabled(true);
    window.gtag?.('consent', 'update', {
      analytics_storage: 'denied',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
    });
    document.getElementById(GA_SCRIPT_ID)?.remove();
    clearGaCookies();
    return;
  }

  if (analyticsEnabled) return;
  analyticsEnabled = true;
  setGaDisabled(false);

  window.dataLayer = window.dataLayer || [];
  window.gtag =
    window.gtag ||
    function gtag(...args: unknown[]) {
      window.dataLayer?.push(args);
    };

  window.gtag('consent', 'default', {
    analytics_storage: 'granted',
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
  });
  window.gtag('js', new Date());
  window.gtag('config', GA_MEASUREMENT_ID, {
    anonymize_ip: true,
    send_page_view: false,
  });
  window.gtag(
    'event',
    'page_view',
    analyticsPageFields(window.location.pathname, window.location.origin)
  );

  if (!document.getElementById(GA_SCRIPT_ID)) {
    const script = document.createElement('script');
    script.id = GA_SCRIPT_ID;
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
    document.head.appendChild(script);
  }
}

export function trackEvent(
  eventName: string,
  params?: Record<string, unknown>
) {
  if (analyticsEnabled && window.gtag) {
    window.gtag('event', eventName, params);
  }
}

export function trackPageView(path: string) {
  if (analyticsEnabled && window.gtag) {
    window.gtag(
      'event',
      'page_view',
      analyticsPageFields(path, window.location.origin)
    );
  }
}

// Bubble-specific events
export const analytics = {
  bubbleBlow: (size: string) =>
    trackEvent('bubble_blow', { bubble_size: size }),
  bubblePop: (isOwn: boolean) => trackEvent('bubble_pop', { is_own: isOwn }),
  placeCreate: (theme: string) => trackEvent('place_create', { theme }),
  placeJoin: (placeId: string) =>
    trackEvent('place_join', { place_id: placeId }),
  modeSwitch: (mode: string) => trackEvent('mode_switch', { mode }),
  share: (method: string) => trackEvent('share', { method }),
};
