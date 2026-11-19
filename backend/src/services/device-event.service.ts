import { Prisma, type AccessEvent, type SensorEvent } from '@prisma/client';
import { prisma } from '../config/prisma';
import { eventRepository } from '../repositories/event.repository';
import type { AuthDevice, IngestResult } from '../types';
import { HttpError } from '../utils/http-error';
import type { AccessEventInput, HeartbeatInput, SensorEventInput } from '../validators/device-event.validator';
import { alertService } from './alert.service';
import { deviceService } from './device.service';
import { realtime } from './realtime.service';

/** Tolerância para relógio adiantado do dispositivo. */
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

/**
 * Define o horário do evento: usa o horário do dispositivo quando presente e plausível;
 * caso contrário, o horário de recebimento.
 */
export function resolveOccurredAt(occurredAt: string | undefined, receivedAt: Date): Date {
  if (!occurredAt) return receivedAt;
  const date = new Date(occurredAt);
  if (Number.isNaN(date.getTime()) || date.getTime() - receivedAt.getTime() > MAX_CLOCK_SKEW_MS) {
    return receivedAt;
  }
  return date;
}

function assertSameDevice(device: AuthDevice, payloadDeviceId?: string) {
  if (payloadDeviceId && payloadDeviceId !== device.id) {
    throw HttpError.forbidden('O deviceId do evento não corresponde ao dispositivo autenticado.');
  }
}

function isUniqueViolation(err: unknown) {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

export const deviceEventService = {
  async ingestAccess(device: AuthDevice, input: AccessEventInput, now = new Date()): Promise<IngestResult<AccessEvent>> {
    assertSameDevice(device, input.deviceId);
    await deviceService.touch(device.id, now);

    const existing = await eventRepository.findAccessByExternalId(device.id, input.eventId);
    if (existing) return { duplicate: true, event: existing };

    try {
      const event = await eventRepository.createAccess({
        externalEventId: input.eventId,
        deviceId: device.id,
        eventType: input.eventType,
        direction: input.direction,
        occurredAt: resolveOccurredAt(input.occurredAt, now),
        receivedAt: now,
        metadata: input.metadata ?? Prisma.JsonNull,
      });
      realtime.publish('access-event', { eventId: event.id, deviceId: device.id, eventType: event.eventType });
      return { duplicate: false, event };
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      const event = await eventRepository.findAccessByExternalId(device.id, input.eventId);
      return { duplicate: true, event: event! };
    }
  },

  async ingestSensor(
    device: AuthDevice,
    input: SensorEventInput,
    now = new Date(),
  ): Promise<IngestResult<SensorEvent> & { applied: boolean }> {
    assertSameDevice(device, input.deviceId);

    const point = await prisma.monitoredPoint.findUnique({ where: { id: input.pointId } });
    if (!point) throw HttpError.notFound('Ponto monitorado não encontrado.');
    if (point.deviceId !== device.id) {
      throw HttpError.forbidden('O ponto informado não pertence a este dispositivo.');
    }

    await deviceService.touch(device.id, now);

    const existing = await eventRepository.findSensorByExternalId(device.id, input.eventId);
    if (existing) return { duplicate: true, applied: false, event: existing };

    const occurredAt = resolveOccurredAt(input.occurredAt, now);

    let event: SensorEvent;
    let applied = false;
    try {
      ({ event, applied } = await prisma.$transaction(async (tx) => {
        const created = await tx.sensorEvent.create({
          data: {
            externalEventId: input.eventId,
            deviceId: device.id,
            monitoredPointId: point.id,
            state: input.state,
            occurredAt,
            receivedAt: now,
          },
        });

        // Bloqueia a linha do ponto para aplicar o estado de forma consistente.
        const [fresh] = await tx.$queryRaw<
          { lastKnownState: 'OPEN' | 'CLOSED' | null; stateChangedAt: Date | null; lastEventAt: Date | null }[]
        >`SELECT "lastKnownState", "stateChangedAt", "lastEventAt" FROM "MonitoredPoint" WHERE id = ${point.id}::uuid FOR UPDATE`;

        // Eventos antigos (reenviados de uma fila offline) entram só no histórico.
        if (fresh.lastEventAt && occurredAt < fresh.lastEventAt) {
          return { event: created, applied: false };
        }

        const sameState = fresh.lastKnownState === input.state && fresh.stateChangedAt !== null;
        await tx.monitoredPoint.update({
          where: { id: point.id },
          data: {
            currentState: input.state,
            lastKnownState: input.state,
            stateChangedAt: sameState ? fresh.stateChangedAt : occurredAt,
            lastEventAt: occurredAt,
          },
        });
        return { event: created, applied: true };
      }));
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      const dup = await eventRepository.findSensorByExternalId(device.id, input.eventId);
      return { duplicate: true, applied: false, event: dup! };
    }

    if (applied && input.state === 'CLOSED') {
      await alertService.resolveOpenTooLongForPoint(point.id, now);
    }

    realtime.publish('sensor-event', { eventId: event.id, pointId: point.id, state: input.state });
    if (applied) realtime.publish('point-updated', { pointId: point.id, state: input.state });
    return { duplicate: false, applied, event };
  },

  async heartbeat(device: AuthDevice, input: HeartbeatInput, now = new Date()) {
    assertSameDevice(device, input.deviceId);
    if (input.status === 'OFFLINE') {
      await deviceService.markOffline(device.id, 'desconexão informada pelo dispositivo', now);
    } else {
      await deviceService.touch(device.id, now);
    }
    return deviceService.status(device.id, now);
  },
};
