import type { MonitoredPoint } from '../types';
import { formatDateTime, formatDuration, POINT_STATE_LABEL, POINT_TYPE_LABEL, secondsSince } from '../utils/format';
import { DeviceStatus } from './DeviceStatus';

interface Props {
  point: MonitoredPoint;
  now: number;
}

export function MonitoredPointCard({ point, now }: Props) {
  const state = point.currentState;
  const openFor = secondsSince(point.openSince, now);
  const overLimit = openFor !== null && openFor >= point.maxOpenSeconds;
  const stateClass = state === 'OPEN' ? 'is-open' : state === 'CLOSED' ? 'is-closed' : 'is-unknown';

  return (
    <article className={`point-card ${stateClass}`} aria-label={`${point.name}: ${POINT_STATE_LABEL[state]}`}>
      <header className="point-card-header">
        <div>
          <h3>{point.name}</h3>
          <p className="muted small">
            {POINT_TYPE_LABEL[point.type]} · {point.location}
          </p>
        </div>
        <span className={`badge state-${state.toLowerCase()}`}>
          <span className="state-icon" aria-hidden="true">
            {state === 'OPEN' ? '▲' : state === 'CLOSED' ? '■' : '?'}
          </span>
          {POINT_STATE_LABEL[state]}
        </span>
      </header>

      {state === 'OPEN' && openFor !== null && (
        <p className={overLimit ? 'text-danger' : ''}>
          Aberto há <strong>{formatDuration(openFor)}</strong>
          {overLimit && ' — acima do limite'}
        </p>
      )}

      {state === 'UNKNOWN' && (
        <p className="warning-box" role="note">
          Sem comunicação com o sensor. O estado atual é desconhecido.
          {point.lastKnownState && (
            <>
              {' '}
              Última leitura: <strong>{POINT_STATE_LABEL[point.lastKnownState]}</strong> em{' '}
              {formatDateTime(point.lastEventAt)}.
            </>
          )}
        </p>
      )}

      <dl className="point-meta small">
        <div>
          <dt>Limite de abertura</dt>
          <dd>{formatDuration(point.maxOpenSeconds)}</dd>
        </div>
        <div>
          <dt>Última leitura</dt>
          <dd>{formatDateTime(point.lastEventAt)}</dd>
        </div>
        <div>
          <dt>Dispositivo</dt>
          <dd>
            {point.device.name} <DeviceStatus status={point.device.status} lastSeenAt={point.device.lastSeenAt} compact />
          </dd>
        </div>
      </dl>
    </article>
  );
}
