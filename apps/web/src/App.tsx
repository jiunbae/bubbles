import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AuthProvider } from '@/providers/AuthProvider';
import { WebSocketProvider } from '@/providers/WebSocketProvider';
import { ErrorBoundary } from '@/components/shared/ErrorBoundary';
import { Toaster } from '@/components/shared/Toast';
import { LobbyPage } from '@/routes/LobbyPage';
import { PlacePage } from '@/routes/PlacePage';
import { AuthCallback } from '@/routes/AuthCallback';
import { NotFoundPage } from '@/routes/NotFoundPage';
import { PrivacyPage } from '@/routes/PrivacyPage';
import { usePlaceStore } from '@/stores/place-store';
import { PrivacyProvider } from '@/providers/PrivacyProvider';
import { PrivacyConsent } from '@/components/shared/PrivacyConsent';
import { trackPageView } from '@/lib/analytics';

function DocumentTitle() {
  const location = useLocation();
  const placeName = usePlaceStore((state) => state.currentPlace?.name);
  const { t } = useTranslation();

  useEffect(() => {
    document.title =
      location.pathname.startsWith('/place/') && placeName
        ? `${placeName} — Bubbles`
        : location.pathname === '/privacy'
          ? `${t('privacyNotice.pageTitle')} — Bubbles`
          : 'Bubbles';
  }, [location.pathname, placeName, t]);

  return null;
}

function AnalyticsPageView() {
  const location = useLocation();

  useEffect(() => {
    trackPageView(location.pathname);
  }, [location.pathname]);

  return null;
}

export function App() {
  return (
    <PrivacyProvider>
      <ErrorBoundary>
        <AuthProvider>
          <WebSocketProvider>
            <BrowserRouter>
              <DocumentTitle />
              <AnalyticsPageView />
              <Routes>
                <Route path="/" element={<LobbyPage />} />
                <Route path="/place/:placeId" element={<PlacePage />} />
                <Route path="/auth/callback" element={<AuthCallback />} />
                <Route path="/privacy" element={<PrivacyPage />} />
                <Route path="*" element={<NotFoundPage />} />
              </Routes>
            </BrowserRouter>
            <Toaster />
          </WebSocketProvider>
        </AuthProvider>
      </ErrorBoundary>
      <PrivacyConsent />
    </PrivacyProvider>
  );
}
