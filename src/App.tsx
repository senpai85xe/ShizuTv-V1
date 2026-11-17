import React from 'react';
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { AppProvider } from './store/AppContext';
import { PipProvider } from './store/PipContext';
import { GlobalBackground } from './components/GlobalBackground';
import { SecurityGate } from './components/SecurityGate';
import { OfflineStatusBanner } from './components/OfflineStatusBanner';
import { FloatingPipPlayer } from './components/FloatingPipPlayer';
import { NavShell } from './components/NavShell';
import { HomePage } from './pages/HomePage';
import { DiscoverPage } from './pages/DiscoverPage';
import { DetailsPage } from './pages/DetailsPage';
import { LibraryPage } from './pages/LibraryPage';
import { ReaderPage } from './pages/ReaderPage';
import { WatchTogetherPage } from './pages/WatchTogetherPage';
import { WatchTogetherRoomPage } from './pages/WatchTogetherRoomPage';
import { CommunityPage } from './pages/CommunityPage';
import { CalendarPage } from './pages/CalendarPage';
import { DownloadsPage } from './pages/DownloadsPage';
import { ContinueHistoryPage } from './pages/ContinueHistoryPage';
import { SettingsPage } from './pages/SettingsPage';
import {
  AboutSettingsPage,
  BackupSettingsPage,
  ContentSettingsPage,
  DiscordSettingsPage,
  ExtensionsSettingsPage,
  HomeSectionsSettingsPage,
  LogsSettingsPage,
  PlayerSettingsPage,
  ReaderSettingsPage,
  SecuritySettingsPage,
  ThemeSettingsPage,
  TrackingSettingsPage,
  UiSettingsPage,
} from './pages/SettingsSubPages';
import { recordVisitedRoute } from './utils/scrollPersistence';
import { resolveRouteDocumentTitle } from './utils/documentTitle';
import { useDocumentTitle } from './hooks/useDocumentTitle';

const RouteScrollCoordinator: React.FC = () => {
  const location = useLocation();
  recordVisitedRoute(location.pathname);
  const routeTitle = resolveRouteDocumentTitle(location.pathname);
  useDocumentTitle(routeTitle);
  return null;
};

const ShellLayout: React.FC = () => (
  <NavShell>
    <Outlet />
  </NavShell>
);

export const App: React.FC = () => {
  return (
    <AppProvider>
      <GlobalBackground>
        <SecurityGate>
          <BrowserRouter>
            <RouteScrollCoordinator />
            <PipProvider>
              <Routes>
                {/* Fullscreen Reader & Details Sheet (No NavShell) */}
                <Route path="/reader" element={<ReaderPage />} />
                <Route path="/details/:mediaType/:id" element={<DetailsPage />} />

                {/* Main Application Shell */}
                <Route element={<ShellLayout />}>
                  <Route path="/" element={<Navigate to="/home" replace />} />
                  <Route path="/home" element={<HomePage />} />
                  <Route path="/discover" element={<DiscoverPage />} />
                  <Route path="/watch-together" element={<WatchTogetherPage />} />
                  <Route path="/watch-together/:roomCode" element={<WatchTogetherRoomPage />} />
                  <Route path="/community" element={<CommunityPage />} />
                  <Route path="/library" element={<LibraryPage />} />
                  <Route path="/downloads" element={<DownloadsPage />} />
                  <Route path="/calendar" element={<CalendarPage />} />
                  <Route path="/continue/:mediaType" element={<ContinueHistoryPage />} />

                  {/* Settings Suite */}
                  <Route path="/settings" element={<SettingsPage />} />
                  <Route path="/settings/theme" element={<ThemeSettingsPage />} />
                  <Route path="/settings/ui" element={<UiSettingsPage />} />
                  <Route path="/settings/home" element={<HomeSectionsSettingsPage />} />
                  <Route path="/settings/tracking" element={<TrackingSettingsPage />} />
                  <Route path="/settings/extensions" element={<ExtensionsSettingsPage />} />
                  <Route path="/settings/player" element={<PlayerSettingsPage />} />
                  <Route path="/settings/reader" element={<ReaderSettingsPage />} />
                  <Route path="/settings/content" element={<ContentSettingsPage />} />
                  <Route path="/settings/security" element={<SecuritySettingsPage />} />
                  <Route path="/settings/backup" element={<BackupSettingsPage />} />
                  <Route path="/settings/discord" element={<DiscordSettingsPage />} />
                  <Route path="/settings/logs" element={<LogsSettingsPage />} />
                  <Route path="/settings/about" element={<AboutSettingsPage />} />
                </Route>

                <Route path="*" element={<Navigate to="/home" replace />} />
              </Routes>
              <FloatingPipPlayer />
            </PipProvider>
          </BrowserRouter>
          <OfflineStatusBanner />
        </SecurityGate>
      </GlobalBackground>
    </AppProvider>
  );
};

export default App;
