import { env } from '../config/env';
import { prisma } from '../config/prisma';
import { monitoredPointRepository, type PointWithDevice } from '../repositories/monitored-point.repository';
import { HttpError } from '../utils/http-error';
import type { CreatePointInput, UpdatePointInput } from '../validators/monitored-point.validator';
import { realtime } from './realtime.service';

export function toPublicPoint(p: PointWithDevice) {
  return {
    id: p.id,
    name: p.name,
    location: p.location,
    type: p.type,
    currentState: p.currentState,
    lastKnownState: p.lastKnownState,
    stateChangedAt: p.stateChangedAt,
    lastEventAt: p.lastEventAt,
    /** Início da abertura atual; só preenchido quando o estado atual é OPEN. */
    openSince: p.currentState === 'OPEN' ? p.stateChangedAt : null,
    maxOpenSeconds: p.maxOpenSeconds,
    device: p.device,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

async function ensureDevice(deviceId: string) {
  const exists = await prisma.device.findUnique({ where: { id: deviceId }, select: { id: true } });
  if (!exists) throw HttpError.badRequest('Dispositivo informado não existe.', [
    { field: 'deviceId', message: 'Dispositivo não encontrado.' },
  ]);
}

export const monitoredPointService = {
  async list() {
    return (await monitoredPointRepository.list()).map(toPublicPoint);
  },

  async get(id: string) {
    const point = await monitoredPointRepository.findById(id);
    if (!point) throw HttpError.notFound('Ponto monitorado não encontrado.');
    return toPublicPoint(point);
  },

  async create(input: CreatePointInput) {
    await ensureDevice(input.deviceId);
    const point = await monitoredPointRepository.create({
      ...input,
      maxOpenSeconds: input.maxOpenSeconds ?? env.DEFAULT_MAX_OPEN_SECONDS,
    });
    realtime.publish('point-updated', { pointId: point.id });
    return toPublicPoint(point);
  },

  async update(id: string, input: UpdatePointInput) {
    const current = await this.get(id);
    if (input.deviceId && input.deviceId !== current.device.id) {
      await ensureDevice(input.deviceId);
    }
    // Trocar o dispositivo invalida o estado: aguarda nova leitura do sensor.
    const resetState =
      input.deviceId && input.deviceId !== current.device.id
        ? { currentState: 'UNKNOWN' as const, lastKnownState: null, stateChangedAt: null, lastEventAt: null }
        : {};
    const point = await monitoredPointRepository.update(id, { ...input, ...resetState });
    realtime.publish('point-updated', { pointId: point.id });
    return toPublicPoint(point);
  },
};
