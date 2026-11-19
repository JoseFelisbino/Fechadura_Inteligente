import type { DeviceStatusValue } from '../types';
import { formatDateTime } from '../utils/format';

interface Props {
  status: DeviceStatusValue;
  lastSeenAt: string | null;
  compact?: boolean;
}

export function DeviceStatus({ status, lastSeenAt, compact }: Props) {
  const online = status === 'ONLINE';
  return (
    <span className={`device-status ${online ? 'is-online' : 'is-offline'}`}>
      <span className="dot" aria-hidden="true" />
      <span>{online ? 'Online' : 'Sem comunicação'}</span>
      {!compact && <span className="muted small">· última comunicação {formatDateTime(lastSeenAt)}</span>}
    </span>
  );
}
