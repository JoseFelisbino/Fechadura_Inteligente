import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/config/prisma';
import { TOPICOS } from '../src/mqtt/topicos';
import { rodarMonitor } from '../src/services/monitor.service';
import { app, doArduino, ficarOnline, limparTudo, publicados, segundos, simularBroker } from './helpers';

beforeEach(limparTudo);
afterAll(() => prisma.$disconnect());

describe('Comandos do app', () => {
  it('publica o comando e fica PENDENTE até a resposta do Arduino', async () => {
    await ficarOnline();
    const res = await request(app).post('/api/comandos').send({ tipo: 'ABRIR_PORTA' });

    expect(res.status).toBe(202);
    expect(res.body.data.status).toBe('PENDENTE');
    expect(publicados).toEqual([{ topico: TOPICOS.comandos, mensagem: { id: res.body.data.id, tipo: 'ABRIR_PORTA' } }]);

    await doArduino(TOPICOS.resposta, { id: res.body.data.id, ok: true });
    const depois = await request(app).get(`/api/comandos/${res.body.data.id}`);
    expect(depois.body.data.status).toBe('OK');
    expect(depois.body.data.respondidoEm).not.toBeNull();
  });

  it('registra a recusa do Arduino com o motivo', async () => {
    await ficarOnline();
    const res = await request(app).post('/api/comandos').send({ tipo: 'DESLIGAR_ALARME' });
    await doArduino(TOPICOS.resposta, { id: res.body.data.id, ok: false, motivo: 'TESTE' });
    const salvo = await prisma.comando.findUniqueOrThrow({ where: { id: res.body.data.id } });
    expect(salvo.status).toBe('FALHOU');
    expect(salvo.motivo).toBe('TESTE');
  });

  it('expira após 15 s sem resposta e ignora a resposta atrasada', async () => {
    await ficarOnline();
    const res = await request(app).post('/api/comandos').send({ tipo: 'TESTAR_BUZZER' });

    await rodarMonitor(segundos(10));
    expect((await prisma.comando.findUniqueOrThrow({ where: { id: res.body.data.id } })).status).toBe('PENDENTE');

    await rodarMonitor(segundos(16));
    const expirado = await prisma.comando.findUniqueOrThrow({ where: { id: res.body.data.id } });
    expect(expirado.status).toBe('EXPIRADO');
    expect(expirado.motivo).toBe('SEM_RESPOSTA');

    await doArduino(TOPICOS.resposta, { id: res.body.data.id, ok: true });
    expect((await prisma.comando.findUniqueOrThrow({ where: { id: res.body.data.id } })).status).toBe('EXPIRADO');
  });

  it('falha na hora se o dispositivo estiver offline', async () => {
    const res = await request(app).post('/api/comandos').send({ tipo: 'ABRIR_PORTA' });
    expect(res.status).toBe(202);
    expect(res.body.data).toMatchObject({ status: 'FALHOU', motivo: 'DISPOSITIVO_OFFLINE' });
    expect(publicados).toHaveLength(0);
  });

  it('falha na hora se o backend estiver sem broker', async () => {
    await ficarOnline();
    simularBroker(false);
    const res = await request(app).post('/api/comandos').send({ tipo: 'FECHAR_PORTA' });
    expect(res.body.data).toMatchObject({ status: 'FALHOU', motivo: 'BROKER_DESCONECTADO' });
  });

  it('recusa tipos inválidos (senhas e ajustes têm rota própria)', async () => {
    expect((await request(app).post('/api/comandos').send({ tipo: 'DEFINIR_SENHA' })).status).toBe(400);
    expect((await request(app).post('/api/comandos').send({ tipo: 'EXPLODIR' })).status).toBe(400);
    expect((await request(app).post('/api/comandos').send({})).status).toBe(400);
    expect((await request(app).get('/api/comandos/nao-e-uuid')).status).toBe(400);
  });
});
