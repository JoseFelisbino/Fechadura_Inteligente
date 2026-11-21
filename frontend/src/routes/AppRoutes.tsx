import { lazy, Suspense } from 'react';
import { Link, Route, Routes } from 'react-router-dom';
import { Carregando } from '../components/feedback';
import { AppLayout } from '../layouts/AppLayout';
import { AjustesPage } from '../pages/AjustesPage';
import { AlertasPage } from '../pages/AlertasPage';
import { HistoricoPage } from '../pages/HistoricoPage';
import { InicioPage } from '../pages/InicioPage';
import { SenhasPage } from '../pages/SenhasPage';

// recharts é a parte mais pesada do app: só baixa quando abrir a tela de gráficos
const GraficosPage = lazy(() => import('../pages/GraficosPage').then((m) => ({ default: m.GraficosPage })));

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<InicioPage />} />
        <Route path="senhas" element={<SenhasPage />} />
        <Route
          path="graficos"
          element={
            <Suspense fallback={<Carregando />}>
              <GraficosPage />
            </Suspense>
          }
        />
        <Route path="historico" element={<HistoricoPage />} />
        <Route path="alertas" element={<AlertasPage />} />
        <Route path="ajustes" element={<AjustesPage />} />
        <Route
          path="*"
          element={
            <p className="vazio">
              Página não encontrada. <Link to="/">Voltar ao início</Link>
            </p>
          }
        />
      </Route>
    </Routes>
  );
}
