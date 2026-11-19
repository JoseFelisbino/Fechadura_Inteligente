import { useState } from 'react';
import { AlertList } from '../components/AlertList';
import { EmptyState, ErrorMessage, LoadingState } from '../components/feedback';
import { PageHeader } from '../components/PageHeader';
import { Pagination } from '../components/Pagination';
import { useAsync } from '../hooks/useAsync';
import { ApiError } from '../services/api';
import { alertService } from '../services/alert.service';
import type { Alert, AlertStatus } from '../types';

export function AlertsPage() {
  const [status, setStatus] = useState<AlertStatus | ''>('ACTIVE');
  const [page, setPage] = useState(1);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const alerts = useAsync(
    () => alertService.list({ status: status || undefined, page, pageSize: 20 }),
    [status, page],
  );

  async function handleResolve(alert: Alert) {
    setActionError(null);
    setResolvingId(alert.id);
    try {
      await alertService.resolve(alert.id);
      alerts.reload();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Falha ao resolver o alerta.');
    } finally {
      setResolvingId(null);
    }
  }

  return (
    <>
      <PageHeader
        title="Alertas"
        description="Aberturas esquecidas e dispositivos sem comunicação."
        updatedAt={alerts.updatedAt}
        refreshing={alerts.refreshing}
        actions={
          <div className="segmented" role="group" aria-label="Filtrar por situação">
            {([['ACTIVE', 'Ativos'], ['RESOLVED', 'Resolvidos'], ['', 'Todos']] as const).map(([value, label]) => (
              <button
                key={label}
                type="button"
                className={status === value ? 'active' : ''}
                aria-pressed={status === value}
                onClick={() => {
                  setStatus(value);
                  setPage(1);
                }}
              >
                {label}
              </button>
            ))}
          </div>
        }
      />
      {actionError && <ErrorMessage error={actionError} />}
      <section className="card">
        {alerts.loading && <LoadingState />}
        {alerts.error && <ErrorMessage error={alerts.error} onRetry={alerts.reload} />}
        {alerts.data && alerts.data.items.length === 0 && <EmptyState title="Nenhum alerta encontrado." />}
        {alerts.data && alerts.data.items.length > 0 && (
          <>
            <AlertList alerts={alerts.data.items} onResolve={handleResolve} resolvingId={resolvingId} />
            <Pagination meta={alerts.data.meta} onChange={setPage} />
          </>
        )}
      </section>
    </>
  );
}
