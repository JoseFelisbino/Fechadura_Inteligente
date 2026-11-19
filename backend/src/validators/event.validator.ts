import { z } from 'zod';
import { paginationSchema, uuidSchema } from './common';

export const EVENT_TYPES = [
  'ACCESS_GRANTED',
  'ACCESS_DENIED',
  'LOCKOUT_STARTED',
  'LOCKOUT_ENDED',
  'LOCK_RELEASED',
  'SENSOR_STATE_CHANGED',
] as const;

export const eventQuerySchema = paginationSchema
  .extend({
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    deviceId: uuidSchema.optional(),
    pointId: uuidSchema.optional(),
    category: z.enum(['ACCESS', 'SENSOR']).optional(),
    eventType: z.enum(EVENT_TYPES).optional(),
    result: z.enum(['SUCCESS', 'FAILURE']).optional(),
    state: z.enum(['OPEN', 'CLOSED']).optional(),
  })
  .refine((q) => !q.from || !q.to || q.from <= q.to, {
    message: 'A data inicial deve ser anterior à final.',
    path: ['from'],
  });

export const directionSchema = z
  .object({ direction: z.enum(['ENTRY', 'EXIT', 'UNKNOWN']) })
  .strict();

export type EventQuery = z.infer<typeof eventQuerySchema>;
