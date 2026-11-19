import { z } from 'zod';
import { uuidSchema } from './common';

const maxOpenSeconds = z.coerce
  .number()
  .int('Informe um número inteiro de segundos.')
  .min(10, 'O limite mínimo é 10 segundos.')
  .max(7 * 24 * 60 * 60, 'O limite máximo é 7 dias.');

export const createPointSchema = z
  .object({
    name: z.string().trim().min(2, 'Nome muito curto.').max(80),
    location: z.string().trim().min(2, 'Localização muito curta.').max(80),
    type: z.enum(['DOOR', 'WINDOW']),
    maxOpenSeconds: maxOpenSeconds.optional(),
    deviceId: uuidSchema,
  })
  .strict();

export const updatePointSchema = z
  .object({
    name: z.string().trim().min(2).max(80).optional(),
    location: z.string().trim().min(2).max(80).optional(),
    type: z.enum(['DOOR', 'WINDOW']).optional(),
    maxOpenSeconds: maxOpenSeconds.optional(),
    deviceId: uuidSchema.optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'Nenhum campo para atualizar.' });

export type CreatePointInput = z.infer<typeof createPointSchema>;
export type UpdatePointInput = z.infer<typeof updatePointSchema>;
