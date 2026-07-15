import { useEffect, useRef } from 'react';
import { usePrivacyConsent } from '@/providers/PrivacyProvider';

export function AdInfeed() {
  const { choices } = usePrivacyConsent();
  const pushed = useRef(false);

  useEffect(() => {
    if (!choices.advertising) {
      pushed.current = false;
      return;
    }
    if (pushed.current) return;
    pushed.current = true;
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch {
      // Blocking the optional provider never affects the surrounding content.
    }
  }, [choices.advertising]);

  if (!choices.advertising) return null;

  return (
    <div style={{ margin: '16px 0', minHeight: 100 }}>
      <ins
        className="adsbygoogle"
        style={{ display: 'block' }}
        data-ad-format="fluid"
        data-ad-layout-key="-6t+ed+2i-1n-4w"
        data-ad-client="ca-pub-3746587025439528"
        data-ad-slot="5931713714"
      />
    </div>
  );
}
