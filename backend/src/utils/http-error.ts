export type ErrorCode = 'VALIDATION_ERROR' | 'NOT_FOUND' | 'CONFLICT' | 'INTERNAL_ERROR';

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ErrorCode,
    message: string,
    public readonly details: unknown[] = [],
  ) {
    super(message);
    this.name = 'HttpError';
  }

  static badRequest(message = 'Dados inválidos.', details: unknown[] = []) {
    return new HttpError(400, 'VALIDATION_ERROR', message, details);
  }
  static notFound(message = 'Recurso não encontrado.') {
    return new HttpError(404, 'NOT_FOUND', message);
  }
  static conflict(message: string) {
    return new HttpError(409, 'CONFLICT', message);
  }
}
