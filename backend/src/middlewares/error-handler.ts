import type { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { isProduction } from '../config/env';
import { HttpError } from '../utils/http-error';
import { logger } from '../utils/logger';

export function notFoundHandler(_req: Request, _res: Response, next: NextFunction) {
  next(HttpError.notFound('Rota não encontrada.'));
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({
      error: { code: err.code, message: err.message, details: err.details },
    });
  }

  // JSON malformado no corpo da requisição
  if (err instanceof SyntaxError && 'body' in err) {
    return res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'JSON inválido.', details: [] },
    });
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      return res.status(409).json({
        error: { code: 'CONFLICT', message: 'Registro duplicado.', details: [] },
      });
    }
    if (err.code === 'P2025') {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Recurso não encontrado.', details: [] },
      });
    }
  }

  logger.error(`Erro não tratado em ${req.method} ${req.path}`, {
    name: (err as Error)?.name,
    message: (err as Error)?.message,
    stack: isProduction ? undefined : (err as Error)?.stack,
  });

  return res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Erro interno do servidor.',
      details: [],
    },
  });
}
