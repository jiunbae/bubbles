import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { AuthProvider } from '@/providers/AuthProvider';
import { WebSocketProvider } from '@/providers/WebSocketProvider';
import { ErrorBoundary } from '@/components/shared/ErrorBoundary';
import { Toaster } from '@/components/shared/Toast';
import { LobbyPage } from '@/routes/LobbyPage';
import { PlacePage } from '@/routes/PlacePage';
import { AuthCallback } from '@/routes/AuthCallback';
import { NotFoundPage } from '@/routes/NotFoundPage';
import { usePlaceStore } from '@/stores/place-store';

function DocumentTitle() {
  const location = useLocation();
  const placeName = usePlaceStore((state) => state.currentPlace?.name);

  useEffect(() => {
    document.title =
      location.pathname.startsWith('/place/') && placeName
        ? `${placeName} — Bubbles`
        : 'Bubbles';
  }, [location.pathname, placeName]);

  return null;
}

export function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <WebSocketProvider>
          <BrowserRouter>
            <DocumentTitle />
            <Routes>
              <Route path="/" element={<LobbyPage />} />
              <Route path="/place/:placeId" element={<PlacePage />} />
              <Route path="/auth/callback" element={<AuthCallback />} />
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </BrowserRouter>
          <Toaster />
        </WebSocketProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}
