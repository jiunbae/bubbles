import { isAdvertisingFeatureEnabled } from '@/lib/privacy-consent';

const ADSENSE_CLIENT_ID = 'ca-pub-3746587025439528';
const ADSENSE_SCRIPT_ID = 'bubbles-adsense-script';

/**
 * Fail closed. This flag must remain off until the deployment has integrated
 * the Google-certified CMP required for every region it serves.
 */
export const ADVERTISING_AVAILABLE = isAdvertisingFeatureEnabled(
  import.meta.env.VITE_ADSENSE_ENABLED
);

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

let advertisingEnabled = false;

export function setAdvertisingEnabled(enabled: boolean) {
  if (typeof document === 'undefined') return;
  const shouldEnable = ADVERTISING_AVAILABLE && enabled;

  if (!shouldEnable) {
    advertisingEnabled = false;
    document.getElementById(ADSENSE_SCRIPT_ID)?.remove();
    return;
  }

  if (advertisingEnabled) return;
  advertisingEnabled = true;

  if (document.getElementById(ADSENSE_SCRIPT_ID)) return;

  const script = document.createElement('script');
  script.id = ADSENSE_SCRIPT_ID;
  script.async = true;
  script.crossOrigin = 'anonymous';
  script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT_ID}`;
  document.head.appendChild(script);
}
