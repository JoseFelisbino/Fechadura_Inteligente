import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AlertList } from '../components/AlertList';
import { MonitoredPointCard } from '../components/MonitoredPointCard';
import { alert, point } from './fixtures';

const NOW = new Date('2026-11-19T18:10:00.000Z').getTime();

describe('MonitoredPointCard', () => {
  it('exibe ponto fechado com texto e indicação visual', () => {
    render(<MonitoredPointCard point={point()} now={NOW} />);
    expect(screen.getByRole('article', { name: 'Porta principal: Fechado' })).toHaveClass('is-closed');
    expect(screen.getByText('Fechado')).toBeInTheDocument();
    expect(screen.getByText(/Porta · Sala/)).toBeInTheDocument();
  });

  it('exibe ponto aberto com tempo de abertura e aviso de limite', () => {
    const p = point({ currentState: 'OPEN', lastKnownState: 'OPEN', openSince: '2026-11-19T18:00:00.000Z', maxOpenSeconds: 300 });
    render(<MonitoredPointCard point={p} now={NOW} />);
    expect(screen.getByText('Aberto')).toBeInTheDocument();
    expect(screen.getByText('10 min 0 s')).toBeInTheDocument();
    expect(screen.getByText(/acima do limite/)).toBeInTheDocument();
  });

  it('avisa ponto sem comunicação sem apresentar a última leitura como atual', () => {
    const p = point({
      currentState: 'UNKNOWN',
      lastKnownState: 'OPEN',
      device: { id: 'd1', name: 'ESP32 Hall', status: 'OFFLINE', lastSeenAt: '2026-11-19T17:00:00.000Z' },
    });
    render(<MonitoredPointCard point={p} now={NOW} />);
    expect(screen.getByRole('article', { name: 'Porta principal: Sem comunicação' })).toHaveClass('is-unknown');
    expect(screen.getByRole('note')).toHaveTextContent('O estado atual é desconhecido');
    expect(screen.getByRole('note')).toHaveTextContent('Última leitura: Aberto');
  });
});

describe('AlertList', () => {
  it('exibe alertas ativos com ponto relacionado e ação de resolver', () => {
    const onResolve = vi.fn();
    render(<AlertList alerts={[alert(), alert({ id: 'a2', status: 'RESOLVED', resolvedAt: '2026-11-19T18:20:00.000Z' })]} onResolve={onResolve} />);
    expect(screen.getByText('Ativo')).toBeInTheDocument();
    expect(screen.getByText('Resolvido')).toBeInTheDocument();
    expect(screen.getAllByText(/Ponto: Janela da cozinha \(Cozinha\)/)).toHaveLength(2);
    // Somente o alerta ativo tem botão de resolver
    expect(screen.getAllByRole('button', { name: 'Resolver' })).toHaveLength(1);
  });
});
