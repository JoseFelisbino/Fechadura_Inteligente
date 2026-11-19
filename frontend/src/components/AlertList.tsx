import type { Alert } from '../types';
import { ALERT_TYPE_LABEL, formatDateTime } from '../utils/format';

interface Props {
  alerts: Alert[];
  onResolve?: (alert: Alert) => void;
  resolvingId?: string | null;
}

/** Abertura prolongada só pode ser resolvida manualmente quando o ponto não está mais aberto (validado no backend). */
export function AlertList({ alerts, onResolve, resolvingId }: Props) {
  return (
    <ul className="alert-list">
      {alerts.map((alert) => (
        <li key={alert.id} className={`alert-item ${alert.status === 'ACTIVE' ? 'is-active' : 'is-resolved'}`}>
          <div className="alert-main">
            <span className={`badge ${alert.status === 'ACTIVE' ? 'badge-danger' : 'badge-muted'}`}>
              {alert.status === 'ACTIVE' ? 'Ativo' : 'Resolvido'}
            </span>
            <strong>{ALERT_TYPE_LABEL[alert.type]}</strong>
            <p>{alert.message}</p>
            <p className="muted small">
              {alert.monitoredPoint
                ? `Ponto: ${alert.monitoredPoint.name} (${alert.monitoredPoint.location})`
                : alert.device
                  ? `Dispositivo: ${alert.device.name}`
                  : null}
              {' · '}Criado em {formatDateTime(alert.createdAt)}
              {alert.resolvedAt && ` · Resolvido em ${formatDateTime(alert.resolvedAt)}`}
              {alert.resolvedBy && ` por ${alert.resolvedBy.name}`}
            </p>
            {alert.resolutionNote && <p className="muted small">{alert.resolutionNote}</p>}
          </div>
          {onResolve && alert.status === 'ACTIVE' && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => onResolve(alert)}
              disabled={resolvingId === alert.id}
            >
              {resolvingId === alert.id ? 'Resolvendo...' : 'Resolver'}
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
