import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/config/prisma';
import { TOPICOS } from '../src/mqtt/topicos';
import { resolverHorario } from '../src/services/evento.service';
import { app, doArduino, evento, limparTudo, novoId } from './helpers';

beforeEach(limparTudo);
afterAll(() => prisma.$disconnect());

describe('Recebimento de eventos', () => {
  it('salva um evento válido com o horário do Arduino', async () => {
    const quando = Date.UTC(2026, 10, 20, 15, 0, 0);
    await doArduino(TOPICOS.eventos, {
      id: 'fechadura-01-3-1',
      tipo: 'ACESSO_LIBERADO',
      origem: 'TECLADO',
      usuario: 'Ana',
      timestamp: quando,
    });

    const salvo = await prisma.evento.findUniqueOrThrow({ where: { idExterno: 'fechadura-01-3-1' } });
    expect(salvo.tipo).toBe('ACESSO_LIBERADO');
    expect(salvo.origem).toBe('TECLADO');
    expect(salvo.usuario).toBe('Ana');
    expect(salvo.ocorridoEm.getTime()).toBe(quando);
  });

  it('não duplica um evento reenviado com o mesmo id', async () => {
    const e = evento('PORTA_ABERTA');
    await doArduino(TOPICOS.eventos, e);
    await doArduino(TOPICOS.eventos, e);
    expect(await prisma.evento.count()).toBe(1);
  });

  it('descarta mensagens inválidas', async () => {
    await doArduino(TOPICOS.eventos, 'isto não é json');
    await doArduino(TOPICOS.eventos, { id: novoId(), tipo: 'TIPO_INVENTADO', origem: 'TECLADO' });
    await doArduino(TOPICOS.eventos, { tipo: 'PORTA_ABERTA', origem: 'SENSOR' }); // sem id
    await doArduino(TOPICOS.eventos, { id: novoId(), tipo: 'PORTA_ABERTA', origem: 'LUGAR_NENHUM' });
    expect(await prisma.evento.count()).toBe(0);
  });

  it('usa a hora de recebimento quando não há horário confiável', () => {
    const recebido = new Date('2026-11-20T12:00:00.000Z');
    expect(resolverHorario(undefined, recebido)).toEqual(recebido);
    expect(resolverHorario(0, recebido)).toEqual(recebido); // relógio zerado (sem NTP)
    expect(resolverHorario(recebido.getTime() + 3_600_000, recebido)).toEqual(recebido); // no futuro
    expect(resolverHorario('lixo', recebido)).toEqual(recebido);
    // segundos e ISO também são aceitos
    expect(resolverHorario(1795175940, recebido).getTime()).toBe(1795175940 * 1000);
    expect(resolverHorario('2026-11-20T11:59:00.000Z', recebido).toISOString()).toBe('2026-11-20T11:59:00.000Z');
  });
});

describe('GET /api/eventos', () => {
  async function criar(tipo: string, iso: string) {
    await doArduino(TOPICOS.eventos, { ...evento(tipo), timestamp: Date.parse(iso) }, new Date('2026-11-21T00:00:00Z'));
  }

  beforeEach(async () => {
    await criar('ACESSO_LIBERADO', '2026-11-20T10:00:00Z');
    await criar('SENHA_INCORRETA', '2026-11-20T11:00:00Z');
    await criar('PORTA_ABERTA', '2026-11-20T12:00:00Z');
    await criar('ACESSO_LIBERADO', '2026-11-19T12:00:00Z');
  });

  it('lista do mais recente para o mais antigo, com paginação', async () => {
    const res = await request(app).get('/api/eventos?porPagina=2');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0].tipo).toBe('PORTA_ABERTA');
    expect(res.body.meta).toMatchObject({ total: 4, page: 1, porPagina: 2 });
  });

  it('filtra por tipo (um ou vários) e por período', async () => {
    const porTipo = await request(app).get('/api/eventos?tipo=ACESSO_LIBERADO,SENHA_INCORRETA');
    expect(porTipo.body.meta.total).toBe(3);

    const periodo = await request(app).get('/api/eventos?de=2026-11-20T00:00:00Z&ate=2026-11-20T23:59:59Z&tipo=ACESSO_LIBERADO');
    expect(periodo.body.meta.total).toBe(1);
  });

  it('recusa filtros inválidos', async () => {
    expect((await request(app).get('/api/eventos?tipo=NADA')).status).toBe(400);
    expect((await request(app).get('/api/eventos?de=2026-11-21&ate=2026-11-20')).status).toBe(400);
  });

  it('conta acessos liberados e negados por hora (horário de Brasília)', async () => {
    const res = await request(app).get('/api/eventos/por-hora?data=2026-11-20');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(24);
    // 10:00Z = 07:00 em Brasília; 11:00Z = 08:00
    expect(res.body.data[7]).toEqual({ hora: 7, liberados: 1, negados: 0 });
    expect(res.body.data[8]).toEqual({ hora: 8, liberados: 0, negados: 1 });
    // o acesso de 19/11 12:00Z (09:00 em Brasília) é de outro dia
    expect(res.body.data[9]).toEqual({ hora: 9, liberados: 0, negados: 0 });
  });
});
