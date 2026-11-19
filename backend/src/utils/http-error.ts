export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'INVALID_CREDENTIALS'
  | 'FORBIDDEN'
  | 'CSRF_REJECTED'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR';

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
  static unauthorized(message = 'Autenticação necessária.') {
    return new HttpError(401, 'UNAUTHORIZED', message);
  }
  static forbidden(message = 'Acesso negado.') {
    return new HttpError(403, 'FORBIDDEN', message);
  }
  static notFound(message = 'Recurso não encontrado.') {
    return new HttpError(404, 'NOT_FOUND', message);
  }
  static conflict(message: string) {
    return new HttpError(409, 'CONFLICT', message);
  }
}
