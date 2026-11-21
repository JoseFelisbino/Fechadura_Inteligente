import type { Request, Response } from 'express';
import { realtime } from '../services/realtime.service';

const KEEPALIVE_MS = 25_000;

/** Server-Sent Events: o app recebe estado, eventos, alertas e comandos em tempo real. */
export function streamController(req: Request, res: Response) {
  res.status(200).set({
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();

  const enviar = (evento: string, dados: unknown) => {
    res.write(`event: ${evento}\ndata: ${JSON.stringify(dados)}\n\n`);
  };

  res.write('retry: 3000\n\n'); // o navegador reconecta sozinho após 3 s
  enviar('pronto', { em: new Date().toISOString() });

  const cancelar = realtime.assinar((mensagem) => enviar(mensagem.tipo, mensagem.dados));
  const keepAlive = setInterval(() => res.write(`: keep-alive ${Date.now()}\n\n`), KEEPALIVE_MS);

  req.on('close', () => {
    clearInterval(keepAlive);
    cancelar();
  });
}
