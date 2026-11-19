import { EventEmitter } from 'node:events';

/**
 * Barramento interno de notificações para o painel (entregues via Server-Sent Events).
 * As mensagens carregam somente identificadores e dados não sensíveis; o frontend
 * recarrega os recursos afetados pela API REST.
 */
export type RealtimeEventType =
  | 'sensor-event'
  | 'access-event'
  | 'point-updated'
  | 'device-status'
  | 'alert-created'
  | 'alert-resolved';

export interface RealtimeMessage {
  type: RealtimeEventType;
  payload: Record<string, unknown>;
  at: string;
}

const bus = new EventEmitter();
bus.setMaxListeners(200);

export const realtime = {
  publish(type: RealtimeEventType, payload: Record<string, unknown>) {
    const message: RealtimeMessage = { type, payload, at: new Date().toISOString() };
    bus.emit('message', message);
  },
  subscribe(listener: (message: RealtimeMessage) => void) {
    bus.on('message', listener);
    return () => bus.off('message', listener);
  },
};
