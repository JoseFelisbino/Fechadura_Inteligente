import { Router } from 'express';
import * as c from '../controllers/fechadura.controller';
import { streamController } from '../controllers/stream.controller';

/** Rotas da API. Sem autenticação: protótipo de demonstração para a rede local. */
export function buildRouter() {
  const r = Router();

  r.get('/health', (_req, res) => {
    res.json({ data: { status: 'ok' } });
  });

  r.get('/estado', c.estado);
  r.get('/leituras', c.leituras);

  r.get('/eventos', c.eventos);
  r.get('/eventos/por-hora', c.eventosPorHora);

  r.get('/alertas', c.alertas);
  r.patch('/alertas/:id/resolver', c.resolver);

  r.get('/senhas', c.senhas);
  r.get('/senhas/:slot', c.senha);
  r.put('/senhas/:slot', c.salvarSenha);
  r.delete('/senhas/:slot', c.apagarSenha);

  r.post('/comandos', c.novoComando);
  r.get('/comandos/:id', c.comando);

  r.get('/configuracao', c.configuracao);
  r.put('/configuracao', c.salvarConfiguracao);

  r.get('/stream', streamController);

  return r;
}
