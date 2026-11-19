import type { ZodTypeAny, z } from 'zod';
import { HttpError } from '../utils/http-error';

/** Valida `data` contra o schema e lança 400 padronizado em caso de erro. */
export function parseOrThrow<S extends ZodTypeAny>(schema: S, data: unknown): z.infer<S> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const details = result.error.issues.map((i) => ({
      field: i.path.join('.') || null,
      message: i.message,
    }));
    throw HttpError.badRequest('Dados inválidos.', details);
  }
  return result.data;
}
