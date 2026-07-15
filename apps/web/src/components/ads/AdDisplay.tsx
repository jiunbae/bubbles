import { useEffect, useRef } from 'react';
import { usePrivacyConsent } from '@/providers/PrivacyProvider';

export function AdDisplay() {
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
    <div style={{ margin: '16px 0', minHeight: 90 }}>
      <ins
        className="adsbygoogle"
        style={{ display: 'block' }}
        data-ad-client="ca-pub-3746587025439528"
        data-ad-slot="2924741574"
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </div>
  );
}
