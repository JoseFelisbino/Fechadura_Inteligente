import type { Direction } from '@prisma/client';
import { eventRepository } from '../repositories/event.repository';
import { HttpError } from '../utils/http-error';
import type { EventQuery } from '../validators/event.validator';
import { realtime } from './realtime.service';

export const eventService = {
  async list(q: EventQuery) {
    const { items, total } = await eventRepository.listUnified(q);
    return { items, meta: { page: q.page, pageSize: q.pageSize, total } };
  },

  /**
   * Confirmação manual da direção (entrada/saída) de um acesso pelo painel.
   * O sensor magnético sozinho não determina a direção (RF05).
   */
  async setDirection(eventId: string, direction: Direction, userId: string) {
    const event = await eventRepository.findAccessById(eventId);
    if (!event) throw HttpError.notFound('Evento de acesso não encontrado.');
    if (event.eventType !== 'ACCESS_GRANTED') {
      throw HttpError.conflict('A direção só pode ser informada para acessos autorizados.');
    }
    const updated = await eventRepository.updateAccessDirection(eventId, {
      direction,
      directionConfirmedAt: direction === 'UNKNOWN' ? null : new Date(),
      directionConfirmedById: direction === 'UNKNOWN' ? null : userId,
    });
    realtime.publish('access-event', { eventId, deviceId: event.deviceId, eventType: event.eventType });
    return updated;
  },
};
