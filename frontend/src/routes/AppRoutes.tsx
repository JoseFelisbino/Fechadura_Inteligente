import { Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from '../components/ProtectedRoute';
import { useAuth } from '../contexts/AuthContext';
import { RealtimeProvider } from '../contexts/RealtimeContext';
import { AppLayout } from '../layouts/AppLayout';
import { AlertsPage } from '../pages/AlertsPage';
import { DashboardPage } from '../pages/DashboardPage';
import { HistoryPage } from '../pages/HistoryPage';
import { LoginPage } from '../pages/LoginPage';
import { MonitoringPage } from '../pages/MonitoringPage';
import { NotFoundPage } from '../pages/NotFoundPage';
import { SettingsPage } from '../pages/SettingsPage';

export function AppRoutes() {
  const { user } = useAuth();
  return (
    <RealtimeProvider enabled={!!user}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<DashboardPage />} />
          <Route path="monitoramento" element={<MonitoringPage />} />
          <Route path="historico" element={<HistoryPage />} />
          <Route path="alertas" element={<AlertsPage />} />
          <Route path="configuracoes" element={<SettingsPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </RealtimeProvider>
  );
}
