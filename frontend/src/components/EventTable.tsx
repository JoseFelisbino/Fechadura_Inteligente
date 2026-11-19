import type { Direction, HistoryEvent } from '../types';
import { DIRECTION_LABEL, EVENT_TYPE_LABEL, formatDateTime, POINT_STATE_LABEL } from '../utils/format';

interface Props {
  events: HistoryEvent[];
  onDirectionChange?: (event: HistoryEvent, direction: Direction) => void;
}

function describe(e: HistoryEvent) {
  if (e.category === 'SENSOR') return e.state === 'OPEN' ? 'Abertura detectada' : 'Fechamento detectado';
  return EVENT_TYPE_LABEL[e.eventType];
}

export function EventTable({ events, onDirectionChange }: Props) {
  return (
    <div className="table-wrap">
      <table className="event-table">
        <thead>
          <tr>
            <th scope="col">Data/hora</th>
            <th scope="col">Evento</th>
            <th scope="col">Origem</th>
            <th scope="col">Resultado / estado</th>
            <th scope="col">Direção</th>
          </tr>
        </thead>
        <tbody>
          {events.map((e) => (
            <tr key={`${e.category}-${e.id}`}>
              <td data-label="Data/hora">
                {formatDateTime(e.occurredAt)}
                {Math.abs(new Date(e.receivedAt).getTime() - new Date(e.occurredAt).getTime()) > 60_000 && (
                  <div className="muted small">recebido {formatDateTime(e.receivedAt)}</div>
                )}
              </td>
              <td data-label="Evento">{describe(e)}</td>
              <td data-label="Origem">
                {e.deviceName}
                {e.pointName && <div className="muted small">{e.pointName} · {e.pointLocation}</div>}
              </td>
              <td data-label="Resultado / estado">
                {e.category === 'SENSOR' && e.state && (
                  <span className={`badge state-${e.state.toLowerCase()}`}>{POINT_STATE_LABEL[e.state]}</span>
                )}
                {e.result && (
                  <span className={`badge ${e.result === 'SUCCESS' ? 'badge-ok' : 'badge-danger'}`}>
                    {e.result === 'SUCCESS' ? 'Sucesso' : 'Falha'}
                  </span>
                )}
              </td>
              <td data-label="Direção">
                {e.eventType === 'ACCESS_GRANTED' && onDirectionChange ? (
                  <select
                    aria-label="Confirmar direção do acesso"
                    value={e.direction ?? 'UNKNOWN'}
                    onChange={(ev) => onDirectionChange(e, ev.target.value as Direction)}
                  >
                    <option value="UNKNOWN">{DIRECTION_LABEL.UNKNOWN}</option>
                    <option value="ENTRY">{DIRECTION_LABEL.ENTRY}</option>
                    <option value="EXIT">{DIRECTION_LABEL.EXIT}</option>
                  </select>
                ) : e.direction ? (
                  DIRECTION_LABEL[e.direction]
                ) : (
                  '—'
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
