import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/config/prisma';
import { CSRF, loginAgent, resetDb } from './helpers';

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

describe('Dispositivos', () => {
  it('cadastra, lista, detalha e atualiza sem expor credenciais', async () => {
    const { agent } = await loginAgent('ADMIN');

    const created = await agent.post('/api/devices').set(CSRF).send({ name: 'ESP32 Porta', description: 'Hall' });
    expect(created.status).toBe(201);
    const id = created.body.data.id;
    expect(created.body.data.status).toBe('OFFLINE');
    expect(created.body.data.hasCredential).toBe(false);
    expect(created.body.data.deviceKeyHash).toBeUndefined();

    const list = await agent.get('/api/devices');
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(1);
    expect(JSON.stringify(list.body)).not.toContain('deviceKeyHash');

    const detail = await agent.get(`/api/devices/${id}`);
    expect(detail.body.data.name).toBe('ESP32 Porta');

    const updated = await agent.patch(`/api/devices/${id}`).set(CSRF).send({ name: 'ESP32 Porta Principal' });
    expect(updated.status).toBe(200);
    expect(updated.body.data.name).toBe('ESP32 Porta Principal');

    const status = await agent.get(`/api/devices/${id}/status`);
    expect(status.body.data).toMatchObject({ status: 'OFFLINE', lastSeenAt: null });
  });

  it('não aceita credencial enviada pelo painel', async () => {
    const { agent } = await loginAgent('ADMIN');
    const res = await agent.post('/api/devices').set(CSRF).send({ name: 'ESP32', deviceKey: 'segredo' });
    expect(res.status).toBe(400);
  });

  it('retorna 404 para dispositivo inexistente e 400 para id inválido', async () => {
    const { agent } = await loginAgent('ADMIN');
    expect((await agent.get('/api/devices/00000000-0000-4000-8000-000000000000')).status).toBe(404);
    expect((await agent.get('/api/devices/abc')).status).toBe(400);
  });
});

describe('Pontos monitorados', () => {
  it('cadastra, lista, detalha e edita portas/janelas', async () => {
    const { agent } = await loginAgent('ADMIN');
    const device = (await agent.post('/api/devices').set(CSRF).send({ name: 'ESP32' })).body.data;

    const created = await agent
      .post('/api/monitored-points')
      .set(CSRF)
      .send({ name: 'Janela da cozinha', location: 'Cozinha', type: 'WINDOW', maxOpenSeconds: 600, deviceId: device.id });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ currentState: 'UNKNOWN', type: 'WINDOW', maxOpenSeconds: 600 });

    const list = await agent.get('/api/monitored-points');
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0].device.id).toBe(device.id);

    const id = created.body.data.id;
    const patched = await agent.patch(`/api/monitored-points/${id}`).set(CSRF).send({ maxOpenSeconds: 120, location: 'Área de serviço' });
    expect(patched.status).toBe(200);
    expect(patched.body.data).toMatchObject({ maxOpenSeconds: 120, location: 'Área de serviço' });

    const events = await agent.get(`/api/monitored-points/${id}/events`);
    expect(events.status).toBe(200);
    expect(events.body.data).toEqual([]);
    expect(events.body.meta.total).toBe(0);
  });

  it('valida campos e dispositivo associado', async () => {
    const { agent } = await loginAgent('ADMIN');
    const bad = await agent.post('/api/monitored-points').set(CSRF).send({ name: 'X', type: 'TELHADO' });
    expect(bad.status).toBe(400);

    const noDevice = await agent
      .post('/api/monitored-points')
      .set(CSRF)
      .send({ name: 'Porta', location: 'Sala', type: 'DOOR', deviceId: '00000000-0000-4000-8000-000000000000' });
    expect(noDevice.status).toBe(400);
  });
});
