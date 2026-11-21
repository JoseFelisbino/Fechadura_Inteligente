import { EventEmitter } from 'node:events';

/**
 * Barramento interno de notificações para o app (entregue por Server-Sent Events em /api/stream).
 * Nunca carrega senhas.
 */
export type TipoTempoReal = 'estado' | 'evento' | 'alerta' | 'comando' | 'senha' | 'configuracao';

export interface MensagemTempoReal {
  tipo: TipoTempoReal;
  dados: unknown;
  em: string;
}

const bus = new EventEmitter();
bus.setMaxListeners(200);

export const realtime = {
  publicar(tipo: TipoTempoReal, dados: unknown) {
    const mensagem: MensagemTempoReal = { tipo, dados, em: new Date().toISOString() };
    bus.emit('mensagem', mensagem);
  },
  assinar(ouvinte: (mensagem: MensagemTempoReal) => void) {
    bus.on('mensagem', ouvinte);
    return () => bus.off('mensagem', ouvinte);
  },
};
