import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';
import './assets/styles.css';
import { FechaduraProvider } from './contexts/FechaduraContext';
import { AppRoutes } from './routes/AppRoutes';

// Service worker do PWA: guarda o "casco" do app para abrir mesmo sem internet.
registerSW({ immediate: true });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <FechaduraProvider>
        <AppRoutes />
      </FechaduraProvider>
    </BrowserRouter>
  </StrictMode>,
);
