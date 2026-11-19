import type { Request, Response } from 'express';
import { realtime } from '../services/realtime.service';

const KEEPALIVE_MS = 25_000;

/**
 * Server-Sent Events para atualização em tempo real do painel.
 * Autenticado pelo mesmo cookie HttpOnly do painel (EventSource com `withCredentials`).
 */
export function streamController(req: Request, res: Response) {
  res.status(200).set({
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();

  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  // Instrui o navegador a reconectar após 3 s se a conexão cair.
  res.write('retry: 3000\n\n');
  send('ready', { at: new Date().toISOString() });

  const unsubscribe = realtime.subscribe((message) => send(message.type, message));
  const keepAlive = setInterval(() => res.write(`: keep-alive ${Date.now()}\n\n`), KEEPALIVE_MS);

  req.on('close', () => {
    clearInterval(keepAlive);
    unsubscribe();
  });
}
