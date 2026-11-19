import type { AlertType, Direction, EventType, PointState, PointType } from '../types';

const dateTimeFormatter = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'medium',
});

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  return Number.isNaN(date.getTime()) ? '—' : dateTimeFormatter.format(date);
}

export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d) return `${d} d ${h} h`;
  if (h) return `${h} h ${m} min`;
  if (m) return `${m} min ${sec} s`;
  return `${sec} s`;
}

export function secondsSince(value: string | null, now: number = Date.now()): number | null {
  if (!value) return null;
  return Math.max(0, Math.floor((now - new Date(value).getTime()) / 1000));
}

export const POINT_STATE_LABEL: Record<PointState, string> = {
  OPEN: 'Aberto',
  CLOSED: 'Fechado',
  UNKNOWN: 'Sem comunicação',
};

export const POINT_TYPE_LABEL: Record<PointType, string> = {
  DOOR: 'Porta',
  WINDOW: 'Janela',
};

export const EVENT_TYPE_LABEL: Record<EventType, string> = {
  ACCESS_GRANTED: 'Acesso autorizado',
  ACCESS_DENIED: 'Senha incorreta',
  LOCKOUT_STARTED: 'Bloqueio por tentativas',
  LOCKOUT_ENDED: 'Fim do bloqueio',
  LOCK_RELEASED: 'Trava liberada',
  SENSOR_STATE_CHANGED: 'Mudança de sensor',
};

export const DIRECTION_LABEL: Record<Direction, string> = {
  ENTRY: 'Entrada',
  EXIT: 'Saída',
  UNKNOWN: 'Sem direção identificada',
};

export const ALERT_TYPE_LABEL: Record<AlertType, string> = {
  OPEN_TOO_LONG: 'Abertura prolongada',
  DEVICE_OFFLINE: 'Dispositivo sem comunicação',
};

/** Converte o valor de um <input type="datetime-local"> para ISO (UTC). */
export function localInputToIso(value: string): string | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}
