import { Link } from 'react-router-dom';
import { EmptyState, ErrorMessage, LoadingState } from '../components/feedback';
import { MonitoredPointCard } from '../components/MonitoredPointCard';
import { PageHeader } from '../components/PageHeader';
import { useAsync } from '../hooks/useAsync';
import { useNow } from '../hooks/useNow';
import { monitoredPointService } from '../services/monitored-point.service';

export function MonitoringPage() {
  const { data, error, loading, refreshing, updatedAt, reload } = useAsync(() => monitoredPointService.list(), []);
  const now = useNow();

  return (
    <>
      <PageHeader
        title="Monitoramento"
        description="Estado atual das portas e janelas."
        updatedAt={updatedAt}
        refreshing={refreshing}
      />
      {loading && <LoadingState />}
      {error && <ErrorMessage error={error} onRetry={reload} />}
      {data && data.length === 0 && (
        <EmptyState title="Nenhuma porta ou janela cadastrada.">
          <Link to="/configuracoes">Cadastre um ponto monitorado</Link>
        </EmptyState>
      )}
      {data && data.length > 0 && (
        <div className="points-grid">
          {data.map((p) => (
            <MonitoredPointCard key={p.id} point={p} now={now} />
          ))}
        </div>
      )}
    </>
  );
}
