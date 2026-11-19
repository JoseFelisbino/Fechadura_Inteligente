import type { NextFunction, Request, Response } from 'express';
import type { UserRole } from '@prisma/client';
import { env } from '../config/env';
import { verifyAccessToken } from '../services/auth.service';
import { HttpError } from '../utils/http-error';

/** Exige usuário do painel autenticado via cookie HttpOnly com JWT. */
export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies?.[env.COOKIE_NAME];
  if (!token || typeof token !== 'string') return next(HttpError.unauthorized());
  const payload = verifyAccessToken(token);
  if (!payload) return next(HttpError.unauthorized('Sessão inválida ou expirada.'));
  req.user = { id: payload.sub, role: payload.role };
  next();
}

/** Autorização para operações administrativas. Usar após `requireAuth`. */
export function requireRole(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(HttpError.unauthorized());
    if (!roles.includes(req.user.role)) {
      return next(HttpError.forbidden('Operação permitida somente para administradores.'));
    }
    next();
  };
}
