import type { Alert, MonitoredPoint, User } from '../types';

export const user: User = {
  id: 'u1',
  name: 'Admin',
  email: 'admin@teste.com',
  role: 'ADMIN',
  createdAt: '2026-11-19T10:00:00.000Z',
  updatedAt: '2026-11-19T10:00:00.000Z',
};

export function point(overrides: Partial<MonitoredPoint> = {}): MonitoredPoint {
  return {
    id: 'p1',
    name: 'Porta principal',
    location: 'Sala',
    type: 'DOOR',
    currentState: 'CLOSED',
    lastKnownState: 'CLOSED',
    stateChangedAt: '2026-11-19T18:00:00.000Z',
    lastEventAt: '2026-11-19T18:00:00.000Z',
    openSince: null,
    maxOpenSeconds: 300,
    device: { id: 'd1', name: 'ESP32 Hall', status: 'ONLINE', lastSeenAt: '2026-11-19T18:30:00.000Z' },
    createdAt: '2026-11-19T10:00:00.000Z',
    updatedAt: '2026-11-19T10:00:00.000Z',
    ...overrides,
  };
}

export function alert(overrides: Partial<Alert> = {}): Alert {
  return {
    id: 'a1',
    type: 'OPEN_TOO_LONG',
    status: 'ACTIVE',
    message: 'Janela "Cozinha" aberta há mais de 5 min.',
    monitoredPoint: { id: 'p2', name: 'Janela da cozinha', location: 'Cozinha', type: 'WINDOW' },
    device: { id: 'd1', name: 'ESP32 Hall' },
    createdAt: '2026-11-19T18:10:00.000Z',
    resolvedAt: null,
    resolvedBy: null,
    resolutionNote: null,
    ...overrides,
  };
}
