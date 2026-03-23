import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from '@/providers/AuthProvider';
import { WebSocketProvider } from '@/providers/WebSocketProvider';
import { ErrorBoundary } from '@/components/shared/ErrorBoundary';
import { Toaster } from '@/components/shared/Toast';
import { LobbyPage } from '@/routes/LobbyPage';
import { PlacePage } from '@/routes/PlacePage';
import { AuthCallback } from '@/routes/AuthCallback';
import { NotFoundPage } from '@/routes/NotFoundPage';

export function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <WebSocketProvider>
          <BrowserRouter>
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
