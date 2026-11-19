import type { NextFunction, Request, Response } from 'express';
import { HttpError } from '../utils/http-error';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
export const CSRF_HEADER = 'x-requested-with';
export const CSRF_HEADER_VALUE = 'XMLHttpRequest';

/**
 * Proteção CSRF para rotas autenticadas por cookie.
 *
 * Estratégia: cookie `SameSite=Lax` + exigência de um cabeçalho customizado em toda
 * requisição que altera estado. Um formulário ou link de outro site não consegue
 * enviar cabeçalhos customizados, e um `fetch` de outra origem dispara preflight CORS,
 * que é recusado porque só a origem do frontend é aceita.
 */
export function csrfProtection(req: Request, _res: Response, next: NextFunction) {
  if (SAFE_METHODS.has(req.method)) return next();
  if (req.header(CSRF_HEADER) !== CSRF_HEADER_VALUE) {
    return next(new HttpError(403, 'CSRF_REJECTED', 'Requisição rejeitada (proteção CSRF).'));
  }
  next();
}
