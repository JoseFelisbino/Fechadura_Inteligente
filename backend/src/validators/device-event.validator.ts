import { z } from 'zod';
import { uuidSchema } from './common';

/**
 * Contratos dos eventos enviados pelos dispositivos (HTTP e MQTT).
 *
 * Todos os schemas usam `.strict()`: qualquer campo não previsto — em especial
 * `password`, `pin`, `senha`, `code`, `key` — faz o evento ser rejeitado.
 * A senha digitada no teclado nunca deve sair do microcontrolador.
 */

const eventId = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9._:-]+$/, 'eventId deve conter apenas letras, números, ".", "_", ":" ou "-".');

/** Horário informado pelo dispositivo. Opcional: o firmware omite quando o relógio não está sincronizado. */
const occurredAt = z.string().datetime({ offset: true }).optional();

/** Metadados permitidos: chaves conhecidas e valores primitivos, nada de segredos. */
const accessMetadata = z
  .object({
    attempt: z.number().int().min(0).max(100).optional(),
    failedAttempts: z.number().int().min(0).max(100).optional(),
    lockoutSeconds: z.number().int().min(0).max(86400).optional(),
    pulseMs: z.number().int().min(0).max(60000).optional(),
    uptimeMs: z.number().int().min(0).optional(),
    queued: z.boolean().optional(),
    source: z.enum(['KEYPAD', 'EXIT_BUTTON']).optional(),
  })
  .strict();

export const accessEventSchema = z
  .object({
    eventId,
    deviceId: uuidSchema.optional(),
    eventType: z.enum(['ACCESS_GRANTED', 'ACCESS_DENIED', 'LOCKOUT_STARTED', 'LOCKOUT_ENDED', 'LOCK_RELEASED']),
    direction: z.enum(['ENTRY', 'EXIT', 'UNKNOWN']).default('UNKNOWN'),
    occurredAt,
    metadata: accessMetadata.optional(),
  })
  .strict();

export const sensorEventSchema = z
  .object({
    eventId,
    deviceId: uuidSchema.optional(),
    pointId: uuidSchema,
    eventType: z.literal('SENSOR_STATE_CHANGED').default('SENSOR_STATE_CHANGED'),
    state: z.enum(['OPEN', 'CLOSED']),
    occurredAt,
  })
  .strict();

export const heartbeatSchema = z
  .object({
    deviceId: uuidSchema.optional(),
    status: z.enum(['ONLINE', 'OFFLINE']).default('ONLINE'),
    uptimeMs: z.number().int().min(0).optional(),
    queued: z.number().int().min(0).optional(),
    rssi: z.number().int().min(-150).max(0).optional(),
    firmware: z.string().max(32).optional(),
  })
  .strict();

export type AccessEventInput = z.infer<typeof accessEventSchema>;
export type SensorEventInput = z.infer<typeof sensorEventSchema>;
export type HeartbeatInput = z.infer<typeof heartbeatSchema>;
