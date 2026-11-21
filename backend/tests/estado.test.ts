import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/config/prisma';
import { TOPICOS } from '../src/mqtt/topicos';
import { garantirDadosIniciais } from '../src/services/configuracao.service';
import { limparLeiturasAntigas } from '../src/services/estado.service';
import { app, doArduino, evento, ficarOnline, limparTudo, publicados, segundos } from './helpers';

beforeEach(limparTudo);
afterAll(() => prisma.$disconnect());

describe('Estado e leituras', () => {
  it('mostra offline antes do primeiro estado e o estado atual depois', async () => {
    const antes = await request(app).get('/api/estado');
    expect(antes.body.data).toMatchObject({ online: false, porta: 'DESCONHECIDA', ultimoAcesso: null });

    await doArduino(TOPICOS.eventos, evento('ACESSO_LIBERADO', { origem: 'TECLADO', usuario: 'Ana' }));
    await ficarOnline(new Date(), { trava: 'ABERTA', porta: 'ABERTA', distanciaCm: 42 });

    const depois = await request(app).get('/api/estado');
    expect(depois.body.data).toMatchObject({
      online: true,
      trava: 'ABERTA',
      porta: 'ABERTA',
      distanciaCm: 42,
      bloqueado: false,
      alarme: false,
      alertasAtivos: 0,
    });
    expect(depois.body.data.ultimoAcesso).toMatchObject({ usuario: 'Ana', origem: 'TECLADO' });
  });

  it('descarta estado inválido', async () => {
    await doArduino(TOPICOS.estado, { trava: 'MEIO_ABERTA', porta: 'FECHADA', bloqueado: false, alarme: false });
    expect((await request(app).get('/api/estado')).body.data.online).toBe(false);
  });

  it('salva no máximo uma leitura a cada 5 s', async () => {
    const t0 = new Date();
    await ficarOnline(t0);
    await ficarOnline(segundos(2, t0));
    await ficarOnline(segundos(4, t0));
    await ficarOnline(segundos(6, t0), { distanciaCm: 7 });
    expect(await prisma.leitura.count()).toBe(2);

    const res = await request(app).get('/api/leituras?minutos=10');
    expect(res.body.data.map((l: { distanciaCm: number }) => l.distanciaCm)).toEqual([4, 7]);
    expect((await request(app).get('/api/leituras?minutos=0')).status).toBe(400);
  });

  it('apaga leituras com mais de 24 h', async () => {
    const agora = new Date();
    await prisma.leitura.createMany({
      data: [
        { porta: 'FECHADA', trava: 'FECHADA', distanciaCm: 4, criadoEm: new Date(agora.getTime() - 25 * 3_600_000) },
        { porta: 'FECHADA', trava: 'FECHADA', distanciaCm: 5, criadoEm: new Date(agora.getTime() - 23 * 3_600_000) },
      ],
    });
    expect(await limparLeiturasAntigas(agora)).toBe(1);
    expect(await prisma.leitura.count()).toBe(1);
  });
});

describe('Configuração', () => {
  beforeEach(garantirDadosIniciais);

  it('começa com os valores padrão', async () => {
    const res = await request(app).get('/api/configuracao');
    expect(res.body.data).toMatchObject({ tempoAberturaMs: 5000, limiteCm: 10, tempoMaxAbertaS: 30 });
  });

  it('o tempo máximo aberta é só do backend; abertura e limite vão para o Arduino', async () => {
    await ficarOnline();
    const so = await request(app).put('/api/configuracao').send({ tempoMaxAbertaS: 60 });
    expect(so.status).toBe(200);
    expect(so.body.data.comando).toBeNull();
    expect(publicados).toHaveLength(0);

    const res = await request(app).put('/api/configuracao').send({ limiteCm: 12 });
    expect(res.body.data.configuracao).toMatchObject({ limiteCm: 12, tempoMaxAbertaS: 60 });
    expect(publicados[0].mensagem).toMatchObject({
      tipo: 'DEFINIR_CONFIG',
      params: { tempoAberturaMs: 5000, limiteCm: 12 },
    });
  });

  it('valida os limites', async () => {
    expect((await request(app).put('/api/configuracao').send({ limiteCm: 500 })).status).toBe(400);
    expect((await request(app).put('/api/configuracao').send({ tempoAberturaMs: 10 })).status).toBe(400);
    expect((await request(app).put('/api/configuracao').send({})).status).toBe(400);
  });

  it('os dados iniciais são criados uma vez só', async () => {
    await prisma.senha.delete({ where: { slot: 1 } });
    await garantirDadosIniciais();
    expect(await prisma.senha.count()).toBe(0); // não recria a senha que o usuário apagou
  });
});
