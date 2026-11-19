import { z } from 'zod';

// `.strict()` impede que credenciais ou campos inesperados sejam enviados pelo painel.
export const createDeviceSchema = z
  .object({
    name: z.string().trim().min(2, 'Nome muito curto.').max(80),
    description: z.string().trim().max(255).optional(),
  })
  .strict();

export const updateDeviceSchema = z
  .object({
    name: z.string().trim().min(2, 'Nome muito curto.').max(80).optional(),
    description: z.string().trim().max(255).nullable().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'Nenhum campo para atualizar.' });

export type CreateDeviceInput = z.infer<typeof createDeviceSchema>;
export type UpdateDeviceInput = z.infer<typeof updateDeviceSchema>;
