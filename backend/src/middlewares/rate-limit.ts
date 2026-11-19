import rateLimit from 'express-rate-limit';

const handler = (_req: unknown, res: { status: (n: number) => { json: (b: unknown) => void } }) =>
  res.status(429).json({
    error: { code: 'RATE_LIMITED', message: 'Muitas requisições. Tente novamente mais tarde.', details: [] },
  });

const skipInTests = () => process.env.NODE_ENV === 'test' && process.env.ENABLE_RATE_LIMIT !== 'true';

/** Login: 10 tentativas a cada 15 minutos por IP. */
export const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  skip: skipInTests,
  handler,
});

/** Rotas de dispositivos: protege contra força bruta da credencial. */
export const deviceRateLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: skipInTests,
  handler,
});

/** Operações administrativas e demais rotas sensíveis. */
export const sensitiveRateLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: skipInTests,
  handler,
});
