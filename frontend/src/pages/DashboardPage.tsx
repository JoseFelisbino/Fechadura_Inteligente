import { Link } from 'react-router-dom';
import { AlertList } from '../components/AlertList';
import { DeviceStatus } from '../components/DeviceStatus';
import { EventTable } from '../components/EventTable';
import { EmptyState, ErrorMessage, LoadingState } from '../components/feedback';
import { PageHeader } from '../components/PageHeader';
import { StatusCard } from '../components/StatusCard';
import { useAsync } from '../hooks/useAsync';
import { alertService } from '../services/alert.service';
import { deviceService } from '../services/device.service';
import { eventService } from '../services/event.service';
import { monitoredPointService } from '../services/monitored-point.service';

async function loadDashboard() {
  const [points, devices, alerts, events] = await Promise.all([
    monitoredPointService.list(),
    deviceService.list(),
    alertService.active(),
    eventService.list({ pageSize: 8 }),
  ]);
  return { points, devices, alerts, events: events.items };
}

export function DashboardPage() {
  const { data, error, loading, refreshing, updatedAt, reload } = useAsync(loadDashboard, []);

  return (
    <>
      <PageHeader title="Dashboard" description="Resumo da residência em tempo real." updatedAt={updatedAt} refreshing={refreshing} />
      {loading && <LoadingState />}
      {error && <ErrorMessage error={error} onRetry={reload} />}
      {data && (
        <>
          <section className="cards-grid" aria-label="Resumo">
            <StatusCard label="Abertos" value={data.points.filter((p) => p.currentState === 'OPEN').length} tone="warn" />
            <StatusCard label="Fechados" value={data.points.filter((p) => p.currentState === 'CLOSED').length} tone="ok" />
            <StatusCard
              label="Sem comunicação"
              value={data.points.filter((p) => p.currentState === 'UNKNOWN').length}
              tone="neutral"
            />
            <StatusCard label="Alertas ativos" value={data.alerts.length} tone={data.alerts.length ? 'danger' : 'ok'} />
          </section>

          <div className="two-columns">
            <section className="card">
              <h2>
                Alertas ativos <Link to="/alertas" className="small">ver todos</Link>
              </h2>
              {data.alerts.length === 0 ? (
                <EmptyState title="Nenhum alerta ativo." />
              ) : (
                <AlertList alerts={data.alerts} />
              )}
            </section>

            <section className="card">
              <h2>Dispositivos</h2>
              {data.devices.length === 0 ? (
                <EmptyState title="Nenhum dispositivo cadastrado.">
                  <Link to="/configuracoes">Cadastrar em Configurações</Link>
                </EmptyState>
              ) : (
                <ul className="plain-list">
                  {data.devices.map((d) => (
                    <li key={d.id}>
                      <strong>{d.name}</strong>
                      <br />
                      <DeviceStatus status={d.status} lastSeenAt={d.lastSeenAt} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <section className="card">
            <h2>
              Últimos eventos <Link to="/historico" className="small">histórico completo</Link>
            </h2>
            {data.events.length === 0 ? <EmptyState title="Nenhum evento recebido ainda." /> : <EventTable events={data.events} />}
          </section>
        </>
      )}
    </>
  );
}
