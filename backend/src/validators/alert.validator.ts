import { z } from 'zod';
import { paginationSchema } from './common';

export const alertQuerySchema = paginationSchema.extend({
  status: z.enum(['ACTIVE', 'RESOLVED']).optional(),
  type: z.enum(['OPEN_TOO_LONG', 'DEVICE_OFFLINE']).optional(),
});

export const resolveAlertSchema = z
  .object({ note: z.string().trim().max(255).optional() })
  .strict();

export type AlertQuery = z.infer<typeof alertQuerySchema>;
