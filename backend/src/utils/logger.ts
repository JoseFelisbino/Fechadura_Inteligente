/**
 * Logger mínimo. Nunca registre senhas, tokens, chaves de dispositivo ou payloads brutos
 * vindos de fora sem passar por `redact`.
 */
const SENSITIVE_KEYS = /pass|senha|pin|secret|token|key|code|cookie|authorization/i;

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 5 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = SENSITIVE_KEYS.test(k) ? '[REDACTED]' : redact(v, depth + 1);
  }
  return out;
}

function write(level: 'info' | 'warn' | 'error', message: string, meta?: unknown) {
  if (process.env.NODE_ENV === 'test' && level !== 'error') return;
  const line = `[${new Date().toISOString()}] ${level.toUpperCase()} ${message}`;
  const args = meta === undefined ? [line] : [line, redact(meta)];
  if (level === 'error') console.error(...args);
  else if (level === 'warn') console.warn(...args);
  else console.log(...args);
}

export const logger = {
  info: (message: string, meta?: unknown) => write('info', message, meta),
  warn: (message: string, meta?: unknown) => write('warn', message, meta),
  error: (message: string, meta?: unknown) => write('error', message, meta),
};
