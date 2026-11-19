import { useRealtime } from '../contexts/RealtimeContext';
import { formatDateTime } from '../utils/format';

/** Indicador da conexão em tempo real com o servidor. */
export function ConnectionStatus() {
  const { status, lastMessageAt } = useRealtime();
  const label = status === 'open' ? 'Tempo real ativo' : status === 'connecting' ? 'Reconectando...' : 'Sem conexão em tempo real';
  return (
    <div className={`connection connection-${status}`} role="status" title={lastMessageAt ? `Último evento: ${formatDateTime(lastMessageAt)}` : undefined}>
      <span className="dot" aria-hidden="true" />
      {label}
    </div>
  );
}

export function ConnectionBanner() {
  const { status } = useRealtime();
  if (status === 'open') return null;
  return (
    <div className="banner banner-warn" role="alert">
      Conexão em tempo real com o servidor indisponível. Os dados são recarregados periodicamente e podem estar
      desatualizados — confira o horário da última atualização.
    </div>
  );
}
