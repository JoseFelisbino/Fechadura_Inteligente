import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/config/prisma';
import { TOPICOS } from '../src/mqtt/topicos';
import { garantirDadosIniciais } from '../src/services/configuracao.service';
import { rodarMonitor } from '../src/services/monitor.service';
import { app, doArduino, ficarOnline, limparTudo, publicados, segundos } from './helpers';

beforeEach(async () => {
  await limparTudo();
  await garantirDadosIniciais();
});
afterAll(() => prisma.$disconnect());

function ultimoComando() {
  return publicados[publicados.length - 1].mensagem as { id: string; tipo: string; params: Record<string, unknown> };
}

describe('Senhas', () => {
  it('lista os 3 slots, com a senha padrão do firmware no slot 1', async () => {
    const res = await request(app).get('/api/senhas');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([
      expect.objectContaining({ slot: 1, nome: 'Admin', senha: '1234', sincronizacao: 'APLICADA' }),
      { slot: 2, vazio: true },
      { slot: 3, vazio: true },
    ]);
  });

  it('salva, envia DEFINIR_SENHA e marca como aplicada quando o Arduino confirma', async () => {
    await ficarOnline();
    const res = await request(app).put('/api/senhas/2').send({ nome: 'Bruno', senha: '4321' });
    expect(res.status).toBe(200);
    expect(res.body.data.senha).toMatchObject({ slot: 2, nome: 'Bruno', senha: '4321', sincronizacao: 'PENDENTE' });

    const cmd = ultimoComando();
    expect(cmd).toMatchObject({ tipo: 'DEFINIR_SENHA', params: { slot: 2, nome: 'Bruno', senha: '4321' } });
    // o histórico de comandos não guarda a senha
    const salvo = await prisma.comando.findUniqueOrThrow({ where: { id: cmd.id } });
    expect(salvo.params).toEqual({ slot: 2, nome: 'Bruno' });

    await doArduino(TOPICOS.resposta, { id: cmd.id, ok: true });
    const depois = await request(app).get('/api/senhas/2');
    expect(depois.body.data.sincronizacao).toBe('APLICADA');
  });

  it('marca FALHOU quando o Arduino recusa ou não responde', async () => {
    await ficarOnline();
    await request(app).put('/api/senhas/2').send({ nome: 'Bruno', senha: '4321' });
    await doArduino(TOPICOS.resposta, { id: ultimoComando().id, ok: false, motivo: 'SENHA_DUPLICADA' });
    expect((await prisma.senha.findUniqueOrThrow({ where: { slot: 2 } })).motivo).toBe('SENHA_DUPLICADA');

    await ficarOnline();
    await request(app).put('/api/senhas/3').send({ nome: 'Visitante', senha: '5555' });
    await rodarMonitor(segundos(16));
    const semResposta = await prisma.senha.findUniqueOrThrow({ where: { slot: 3 } });
    expect(semResposta).toMatchObject({ sincronizacao: 'FALHOU', motivo: 'SEM_RESPOSTA' });
  });

  it('marca FALHOU na hora com o dispositivo offline', async () => {
    const res = await request(app).put('/api/senhas/2').send({ nome: 'Bruno', senha: '4321' });
    expect(res.body.data.senha).toMatchObject({ sincronizacao: 'FALHOU', motivo: 'DISPOSITIVO_OFFLINE' });
  });

  it('valida nome, senha, slot e senha repetida', async () => {
    const put = (slot: number | string, body: object) => request(app).put(`/api/senhas/${slot}`).send(body);
    expect((await put(2, { nome: 'Bruno', senha: '12a4' })).status).toBe(400);
    expect((await put(2, { nome: 'Bruno', senha: '123' })).status).toBe(400);
    expect((await put(2, { nome: 'Bruno', senha: '123456789' })).status).toBe(400);
    expect((await put(2, { nome: '', senha: '4321' })).status).toBe(400);
    expect((await put(2, { nome: 'Um nome comprido demais', senha: '4321' })).status).toBe(400);
    expect((await put(4, { nome: 'Bruno', senha: '4321' })).status).toBe(400);
    const repetida = await put(2, { nome: 'Bruno', senha: '1234' }); // já é a do slot 1
    expect(repetida.status).toBe(409);
  });

  it('remove o slot só depois da confirmação do Arduino', async () => {
    await ficarOnline();
    const res = await request(app).delete('/api/senhas/1');
    expect(res.status).toBe(202);
    expect((await prisma.senha.findUniqueOrThrow({ where: { slot: 1 } })).sincronizacao).toBe('REMOVENDO');
    expect(ultimoComando()).toMatchObject({ tipo: 'REMOVER_SENHA', params: { slot: 1 } });

    await doArduino(TOPICOS.resposta, { id: ultimoComando().id, ok: true });
    expect((await request(app).get('/api/senhas/1')).status).toBe(404);
    expect((await request(app).delete('/api/senhas/1')).status).toBe(404);
  });
});
