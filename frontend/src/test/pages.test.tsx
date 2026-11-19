import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../contexts/AuthContext';
import { RealtimeProvider } from '../contexts/RealtimeContext';
import { DashboardPage } from '../pages/DashboardPage';
import { HistoryPage } from '../pages/HistoryPage';
import { MonitoringPage } from '../pages/MonitoringPage';
import { AppRoutes } from '../routes/AppRoutes';
import { ApiError } from '../services/api';
import { alertService } from '../services/alert.service';
import { authService } from '../services/auth.service';
import { deviceService } from '../services/device.service';
import { eventService } from '../services/event.service';
import { monitoredPointService } from '../services/monitored-point.service';
import { alert, point, user } from './fixtures';
import { MockEventSource } from './setup';

vi.mock('../services/auth.service', () => ({ authService: { me: vi.fn(), login: vi.fn(), logout: vi.fn() } }));
vi.mock('../services/monitored-point.service', () => ({ monitoredPointService: { list: vi.fn() } }));
vi.mock('../services/device.service', () => ({ deviceService: { list: vi.fn() } }));
vi.mock('../services/alert.service', () => ({ alertService: { active: vi.fn(), list: vi.fn(), resolve: vi.fn() } }));
vi.mock('../services/event.service', () => ({ eventService: { list: vi.fn(), setDirection: vi.fn() } }));

const m = {
  me: vi.mocked(authService.me),
  points: vi.mocked(monitoredPointService.list),
  devices: vi.mocked(deviceService.list),
  active: vi.mocked(alertService.active),
  events: vi.mocked(eventService.list),
};

function renderWithRealtime(ui: ReactNode) {
  return render(
    <MemoryRouter>
      <RealtimeProvider enabled>{ui}</RealtimeProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  m.devices.mockResolvedValue([]);
  m.active.mockResolvedValue([]);
  m.events.mockResolvedValue({ items: [], meta: { page: 1, pageSize: 20, total: 0 } });
});

describe('Monitoramento: carregamento, erro e lista vazia', () => {
  it('mostra carregamento e depois os estados das portas e janelas', async () => {
    m.points.mockResolvedValue([
      point(),
      point({ id: 'p2', name: 'Janela do quarto', type: 'WINDOW', currentState: 'OPEN', openSince: new Date().toISOString() }),
    ]);
    renderWithRealtime(<MonitoringPage />);
    expect(screen.getByText('Carregando...')).toBeInTheDocument();
    expect(await screen.findByRole('article', { name: 'Porta principal: Fechado' })).toBeInTheDocument();
    expect(screen.getByRole('article', { name: 'Janela do quarto: Aberto' })).toBeInTheDocument();
  });

  it('mostra erro e permite tentar novamente', async () => {
    m.points.mockRejectedValueOnce(new ApiError(0, 'NETWORK_ERROR', 'Não foi possível conectar ao servidor.'));
    m.points.mockResolvedValueOnce([point()]);
    renderWithRealtime(<MonitoringPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível conectar ao servidor.');
    await userEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(await screen.findByRole('article', { name: 'Porta principal: Fechado' })).toBeInTheDocument();
  });

  it('mostra estado vazio', async () => {
    m.points.mockResolvedValue([]);
    renderWithRealtime(<MonitoringPage />);
    expect(await screen.findByText('Nenhuma porta ou janela cadastrada.')).toBeInTheDocument();
  });
});

describe('Dashboard', () => {
  it('exibe resumo e alertas ativos', async () => {
    m.points.mockResolvedValue([point(), point({ id: 'p2', currentState: 'OPEN' }), point({ id: 'p3', currentState: 'UNKNOWN' })]);
    m.active.mockResolvedValue([alert()]);
    renderWithRealtime(<DashboardPage />);
    expect(await screen.findByText('Abertura prolongada')).toBeInTheDocument();
    expect(screen.getByText(/Janela "Cozinha" aberta/)).toBeInTheDocument();
    const summary = screen.getByRole('region', { name: 'Resumo' });
    expect(within(summary).getByText('Alertas ativos').nextSibling).toHaveTextContent('1');
    expect(within(summary).getByText('Abertos').nextSibling).toHaveTextContent('1');
    expect(screen.getByText(/Última atualização:/)).toBeInTheDocument();
  });
});

describe('Atualização em tempo real', () => {
  it('recarrega os dados quando chega um novo evento pelo SSE', async () => {
    m.points.mockResolvedValueOnce([point()]);
    m.points.mockResolvedValueOnce([point({ currentState: 'OPEN', openSince: new Date().toISOString() })]);
    renderWithRealtime(<MonitoringPage />);
    expect(await screen.findByRole('article', { name: 'Porta principal: Fechado' })).toBeInTheDocument();

    const source = MockEventSource.instances[0];
    expect(source.url).toMatch(/\/stream$/);
    expect(source.init).toEqual({ withCredentials: true });
    act(() => {
      source.emit('ready');
      source.emit('sensor-event', { type: 'sensor-event', payload: { pointId: 'p1', state: 'OPEN' } });
    });

    expect(await screen.findByRole('article', { name: 'Porta principal: Aberto' })).toBeInTheDocument();
    expect(m.points).toHaveBeenCalledTimes(2);
  });
});

describe('Histórico: filtros', () => {
  it('envia os filtros escolhidos para a API e volta para a página 1', async () => {
    m.devices.mockResolvedValue([
      { id: 'd1', name: 'ESP32 Hall', description: null, status: 'ONLINE', lastSeenAt: null, hasCredential: true, pointsCount: 1, createdAt: '', updatedAt: '' },
    ]);
    m.points.mockResolvedValue([point()]);
    renderWithRealtime(<HistoryPage />);
    expect(await screen.findByText('Nenhum evento encontrado para os filtros.')).toBeInTheDocument();
    await screen.findByRole('option', { name: 'ESP32 Hall' });

    await userEvent.selectOptions(screen.getByLabelText('Dispositivo'), 'd1');
    await userEvent.selectOptions(screen.getByLabelText('Resultado do acesso'), 'FAILURE');
    await userEvent.selectOptions(screen.getByLabelText('Tipo de evento'), 'ACCESS_DENIED');
    await userEvent.click(screen.getByRole('button', { name: 'Filtrar' }));

    await waitFor(() =>
      expect(m.events).toHaveBeenLastCalledWith(
        expect.objectContaining({ deviceId: 'd1', result: 'FAILURE', eventType: 'ACCESS_DENIED', page: 1, pageSize: 20 }),
      ),
    );
  });
});

describe('Proteção de páginas privadas', () => {
  it('redireciona para o login quando não há sessão', async () => {
    m.me.mockRejectedValue(new ApiError(401, 'UNAUTHORIZED', 'Autenticação necessária.'));
    render(
      <MemoryRouter initialEntries={['/monitoramento']}>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </MemoryRouter>,
    );
    expect(await screen.findByRole('button', { name: 'Entrar' })).toBeInTheDocument();
    expect(m.points).not.toHaveBeenCalled();
  });

  it('exibe a página privada quando autenticado', async () => {
    m.me.mockResolvedValue(user);
    m.points.mockResolvedValue([point()]);
    render(
      <MemoryRouter initialEntries={['/monitoramento']}>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </MemoryRouter>,
    );
    expect(await screen.findByRole('heading', { name: 'Monitoramento' })).toBeInTheDocument();
    expect(await screen.findByRole('article', { name: 'Porta principal: Fechado' })).toBeInTheDocument();
  });

  it('valida campos do login antes de enviar', async () => {
    m.me.mockRejectedValue(new ApiError(401, 'UNAUTHORIZED', ''));
    render(
      <MemoryRouter initialEntries={['/login']}>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </MemoryRouter>,
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Entrar' }));
    expect(screen.getByText('Informe um e-mail válido.')).toBeInTheDocument();
    expect(screen.getByText('Informe a senha.')).toBeInTheDocument();
    expect(authService.login).not.toHaveBeenCalled();
  });
});
