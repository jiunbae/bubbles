// Google Analytics 4 helper
declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  }
}

export function trackEvent(eventName: string, params?: Record<string, unknown>) {
  if (window.gtag) {
    window.gtag('event', eventName, params);
  }
}

export function trackPageView(path: string) {
  if (window.gtag) {
    window.gtag('config', 'G-8JQSR962RQ', { page_path: path });
  }
}

// Bubble-specific events
export const analytics = {
  bubbleBlow: (size: string) => trackEvent('bubble_blow', { bubble_size: size }),
  bubblePop: (isOwn: boolean) => trackEvent('bubble_pop', { is_own: isOwn }),
  placeCreate: (name: string, theme: string) => trackEvent('place_create', { place_name: name, theme }),
  placeJoin: (placeId: string) => trackEvent('place_join', { place_id: placeId }),
  modeSwitch: (mode: string) => trackEvent('mode_switch', { mode }),
};
