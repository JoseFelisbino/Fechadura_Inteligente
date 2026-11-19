import type { Device } from '@prisma/client';
import { prisma } from '../config/prisma';
import { env } from '../config/env';
import { deviceRepository } from '../repositories/device.repository';
import { alertRepository } from '../repositories/alert.repository';
import type { AuthDevice } from '../types';
import { verifyDeviceKey } from '../utils/device-key';
import { HttpError } from '../utils/http-error';
import { logger } from '../utils/logger';
import { uuidSchema } from '../validators/common';
import type { CreateDeviceInput, UpdateDeviceInput } from '../validators/device.validator';
import { realtime } from './realtime.service';

type DeviceWithCount = Device & { _count?: { points: number } };

/** Representação pública: nunca inclui `deviceKeyHash`. */
export function toPublicDevice(d: DeviceWithCount) {
  return {
    id: d.id,
    name: d.name,
    description: d.description,
    status: d.status,
    lastSeenAt: d.lastSeenAt,
    hasCredential: d.deviceKeyHash !== null,
    pointsCount: d._count?.points ?? 0,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
}

export async function authenticateDevice(deviceId: string, deviceKey: string): Promise<AuthDevice | null> {
  if (!uuidSchema.safeParse(deviceId).success || deviceKey.length > 200) return null;
  const device = await prisma.device.findUnique({ where: { id: deviceId } });
  if (!device?.deviceKeyHash) return null;
  const ok = await verifyDeviceKey(deviceKey, device.deviceKeyHash);
  return ok ? { id: device.id, name: device.name } : null;
}

export const deviceService = {
  async list() {
    return (await deviceRepository.list()).map(toPublicDevice);
  },

  async get(id: string) {
    const device = await deviceRepository.findById(id);
    if (!device) throw HttpError.notFound('Dispositivo não encontrado.');
    return toPublicDevice(device);
  },

  /**
   * Cadastra o dispositivo sem credencial. A credencial é gerada somente pelo
   * script `npm run device:provision`, no servidor, para nunca passar pelo frontend.
   */
  async create(input: CreateDeviceInput) {
    return toPublicDevice(await deviceRepository.create({ name: input.name, description: input.description }));
  },

  async update(id: string, input: UpdateDeviceInput) {
    await this.get(id);
    return toPublicDevice(await deviceRepository.update(id, input));
  },

  async status(id: string, now = new Date()) {
    const device = await this.get(id);
    const secondsSinceLastSeen = device.lastSeenAt
      ? Math.max(0, Math.floor((now.getTime() - device.lastSeenAt.getTime()) / 1000))
      : null;
    return {
      id: device.id,
      status: device.status,
      lastSeenAt: device.lastSeenAt,
      secondsSinceLastSeen,
      heartbeatTimeoutSeconds: env.HEARTBEAT_TIMEOUT_SECONDS,
      checkedAt: now,
    };
  },

  /** Registra comunicação recebida do dispositivo. */
  async touch(deviceId: string, now = new Date()) {
    const previous = await deviceRepository.markSeen(deviceId, now);
    if (previous === 'OFFLINE') {
      const resolved = await alertRepository.resolveActiveWhere(
        { deviceId, type: 'DEVICE_OFFLINE' },
        now,
        'Comunicação restabelecida.',
      );
      resolved.forEach((id) => realtime.publish('alert-resolved', { alertId: id }));
      realtime.publish('device-status', { deviceId, status: 'ONLINE' });
      logger.info(`Dispositivo ${deviceId} voltou a se comunicar.`);
    }
  },

  /**
   * Marca o dispositivo como sem comunicação (heartbeat expirado ou mensagem "OFFLINE"
   * do testamento MQTT). Os pontos passam a UNKNOWN — o último estado lido é mantido
   * em `lastKnownState` e não é apresentado como leitura atual.
   */
  async markOffline(deviceId: string, reason: string, now = new Date()) {
    const device = await prisma.device.findUnique({ where: { id: deviceId } });
    if (!device || device.status === 'OFFLINE') return;
    await deviceRepository.markOffline(deviceId);
    realtime.publish('device-status', { deviceId, status: 'OFFLINE' });
    realtime.publish('point-updated', { deviceId });

    const occurrenceKey = `DEVICE_OFFLINE:${deviceId}:${(device.lastSeenAt ?? now).toISOString()}`;
    try {
      const alert = await alertRepository.create({
        type: 'DEVICE_OFFLINE',
        deviceId,
        occurrenceKey,
        message: `O dispositivo "${device.name}" está sem comunicação (${reason}).`,
        createdAt: now,
      });
      realtime.publish('alert-created', { alertId: alert.id, type: alert.type });
    } catch (err) {
      if ((err as { code?: string }).code !== 'P2002') throw err;
    }
    logger.warn(`Dispositivo ${deviceId} sem comunicação: ${reason}.`);
  },
};
