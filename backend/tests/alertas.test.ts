import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/config/prisma';
import { TOPICOS } from '../src/mqtt/topicos';
import { obterEstado, resetarEstado } from '../src/services/estado.service';
import { rodarMonitor } from '../src/services/monitor.service';
import { app, doArduino, evento, ficarOnline, limparTudo, segundos } from './helpers';

beforeEach(limparTudo);
afterAll(() => prisma.$disconnect());

const ativos = (tipo: string) => prisma.alerta.count({ where: { tipo: tipo as never, status: 'ATIVO' } });

describe('Alertas', () => {
  it('porta forçada abre um único alerta, resolvido quando o alarme é desligado', async () => {
    await doArduino(TOPICOS.eventos, evento('PORTA_FORCADA'));
    await doArduino(TOPICOS.eventos, evento('PORTA_FORCADA')); // mesma ocorrência: não duplica
    expect(await ativos('PORTA_FORCADA')).toBe(1);

    await doArduino(TOPICOS.eventos, evento('ALARME_DESLIGADO', { origem: 'APP' }));
    expect(await ativos('PORTA_FORCADA')).toBe(0);

    await doArduino(TOPICOS.eventos, evento('PORTA_FORCADA')); // nova ocorrência: novo alerta
    expect(await prisma.alerta.count({ where: { tipo: 'PORTA_FORCADA' } })).toBe(2);
  });

  it('porta que não fechou abre alerta, resolvido quando ela fecha', async () => {
    await doArduino(TOPICOS.eventos, evento('PORTA_NAO_FECHOU'));
    expect(await ativos('PORTA_NAO_FECHOU')).toBe(1);
    await doArduino(TOPICOS.eventos, evento('PORTA_FECHADA'));
    expect(await ativos('PORTA_NAO_FECHOU')).toBe(0);
  });

  it('teclado bloqueado (3 senhas erradas) abre SENHAS_INCORRETAS, que só o app resolve', async () => {
    await doArduino(TOPICOS.eventos, evento('SENHA_INCORRETA'));
    expect(await ativos('SENHAS_INCORRETAS')).toBe(0); // um erro sozinho não é alerta

    await doArduino(TOPICOS.eventos, evento('BLOQUEIO_INICIO'));
    await doArduino(TOPICOS.eventos, evento('BLOQUEIO_INICIO')); // novo bloqueio com o alerta ativo: não duplica
    expect(await ativos('SENHAS_INCORRETAS')).toBe(1);

    await doArduino(TOPICOS.eventos, evento('BLOQUEIO_FIM'));
    expect(await ativos('SENHAS_INCORRETAS')).toBe(1); // continua até alguém ver

    const alerta = await prisma.alerta.findFirstOrThrow({ where: { tipo: 'SENHAS_INCORRETAS' } });
    await request(app).patch(`/api/alertas/${alerta.id}/resolver`);
    expect(await ativos('SENHAS_INCORRETAS')).toBe(0);
  });

  it('porta aberta mais que o tempo máximo (30 s) abre ABERTA_DEMAIS e resolve ao fechar', async () => {
    const t0 = new Date();
    await ficarOnline(t0, { porta: 'ABERTA', distanciaCm: 40 });
    await ficarOnline(segundos(20, t0), { porta: 'ABERTA', distanciaCm: 40 });
    await rodarMonitor(segundos(21, t0));
    expect(await ativos('ABERTA_DEMAIS')).toBe(0);

    await ficarOnline(segundos(30, t0), { porta: 'ABERTA', distanciaCm: 40 });
    await rodarMonitor(segundos(31, t0));
    await rodarMonitor(segundos(32, t0));
    expect(await ativos('ABERTA_DEMAIS')).toBe(1);

    await ficarOnline(segundos(33, t0)); // porta FECHADA
    expect(await ativos('ABERTA_DEMAIS')).toBe(0);
  });

  it('sem estado por 15 s o dispositivo fica offline com alerta; volta sozinho', async () => {
    const t0 = new Date();
    await ficarOnline(t0);
    await rodarMonitor(segundos(10, t0));
    expect(obterEstado().online).toBe(true);

    await rodarMonitor(segundos(16, t0));
    await rodarMonitor(segundos(20, t0));
    expect(obterEstado().online).toBe(false);
    expect(await ativos('OFFLINE')).toBe(1);

    await ficarOnline(segundos(21, t0));
    expect(obterEstado().online).toBe(true);
    expect(await ativos('OFFLINE')).toBe(0);
  });

  it('o testamento (LWT) do broker marca offline na hora', async () => {
    await ficarOnline();
    await doArduino(TOPICOS.status, { online: false });
    expect(obterEstado().online).toBe(false);
    expect(await ativos('OFFLINE')).toBe(1);
  });

  it('avisa OFFLINE se o Arduino nunca apareceu depois que o backend subiu', async () => {
    const t0 = new Date();
    resetarEstado(t0);
    await rodarMonitor(segundos(16, t0));
    expect(await ativos('OFFLINE')).toBe(1);
  });

  it('lista e resolve pelo app', async () => {
    await doArduino(TOPICOS.eventos, evento('PORTA_FORCADA'));
    const lista = await request(app).get('/api/alertas?status=ATIVO');
    expect(lista.body.data).toHaveLength(1);

    const id = lista.body.data[0].id;
    const res = await request(app).patch(`/api/alertas/${id}/resolver`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('RESOLVIDO');
    expect(res.body.data.resolvidoEm).not.toBeNull();

    expect((await request(app).get('/api/alertas?status=ATIVO')).body.data).toHaveLength(0);
    expect((await request(app).patch('/api/alertas/00000000-0000-4000-8000-000000000000/resolver')).status).toBe(404);
    expect((await request(app).patch('/api/alertas/xyz/resolver')).status).toBe(400);
  });
});
