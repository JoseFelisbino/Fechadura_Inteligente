import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/config/prisma';
import { app, createPoint, createProvisionedDevice, eventId, loginAgent, resetDb } from './helpers';

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

describe('Autenticação de dispositivo', () => {
  it('rejeita requisições sem credenciais', async () => {
    const res = await request(app).post('/api/device-events/heartbeat').send({});
    expect(res.status).toBe(401);
  });

  it('rejeita chave incorreta', async () => {
    const { device } = await createProvisionedDevice();
    const res = await request(app)
      .post('/api/device-events/heartbeat')
      .set({ 'X-Device-Id': device.id, 'X-Device-Key': 'chave-errada' })
      .send({});
    expect(res.status).toBe(401);
  });

  it('rejeita dispositivo cadastrado mas não provisionado', async () => {
    const device = await prisma.device.create({ data: { name: 'Sem chave' } });
    const res = await request(app)
      .post('/api/device-events/heartbeat')
      .set({ 'X-Device-Id': device.id, 'X-Device-Key': 'qualquer' })
      .send({});
    expect(res.status).toBe(401);
  });

  it('não aceita o cookie do painel no lugar da credencial do dispositivo', async () => {
    const { agent } = await loginAgent('ADMIN');
    const res = await agent.post('/api/device-events/heartbeat').send({});
    expect(res.status).toBe(401);
  });

  it('heartbeat válido marca o dispositivo como ONLINE', async () => {
    const { device, headers } = await createProvisionedDevice();
    const res = await request(app).post('/api/device-events/heartbeat').set(headers).send({ uptimeMs: 1000 });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('ONLINE');
    const saved = await prisma.device.findUniqueOrThrow({ where: { id: device.id } });
    expect(saved.lastSeenAt).not.toBeNull();
  });

  it('rejeita deviceId do payload diferente do autenticado', async () => {
    const { headers } = await createProvisionedDevice();
    const other = await createProvisionedDevice('Outro');
    const res = await request(app)
      .post('/api/device-events/access')
      .set(headers)
      .send({ eventId: eventId(), deviceId: other.device.id, eventType: 'ACCESS_GRANTED' });
    expect(res.status).toBe(403);
  });
});

describe('Eventos de sensor', () => {
  it('registra abertura e fechamento e atualiza o estado do ponto', async () => {
    const { device, headers } = await createProvisionedDevice();
    const point = await createPoint(device.id);

    const open = await request(app)
      .post('/api/device-events/sensor')
      .set(headers)
      .send({ eventId: eventId(), deviceId: device.id, pointId: point.id, eventType: 'SENSOR_STATE_CHANGED', state: 'OPEN', occurredAt: new Date().toISOString() });
    expect(open.status).toBe(201);
    expect(open.body.data).toMatchObject({ state: 'OPEN', duplicate: false, applied: true });
    let saved = await prisma.monitoredPoint.findUniqueOrThrow({ where: { id: point.id } });
    expect(saved.currentState).toBe('OPEN');
    expect(saved.stateChangedAt).not.toBeNull();

    const close = await request(app)
      .post('/api/device-events/sensor')
      .set(headers)
      .send({ eventId: eventId(), pointId: point.id, state: 'CLOSED' });
    expect(close.status).toBe(201);
    saved = await prisma.monitoredPoint.findUniqueOrThrow({ where: { id: point.id } });
    expect(saved.currentState).toBe('CLOSED');

    const events = await prisma.sensorEvent.findMany({ where: { monitoredPointId: point.id } });
    expect(events).toHaveLength(2);
    events.forEach((e) => expect(e.receivedAt).toBeInstanceOf(Date));
  });

  it('é idempotente: evento repetido não é duplicado', async () => {
    const { device, headers } = await createProvisionedDevice();
    const point = await createPoint(device.id);
    const body = { eventId: 'boot1-42', pointId: point.id, state: 'OPEN' };

    const first = await request(app).post('/api/device-events/sensor').set(headers).send(body);
    const second = await request(app).post('/api/device-events/sensor').set(headers).send(body);

    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.body.data.duplicate).toBe(true);
    expect(second.body.data.id).toBe(first.body.data.id);
    expect(await prisma.sensorEvent.count()).toBe(1);
  });

  it('evento antigo reenviado da fila entra no histórico sem sobrescrever o estado atual', async () => {
    const { device, headers } = await createProvisionedDevice();
    const point = await createPoint(device.id);
    const now = Date.now();
    await request(app).post('/api/device-events/sensor').set(headers)
      .send({ eventId: eventId(), pointId: point.id, state: 'CLOSED', occurredAt: new Date(now).toISOString() });
    const old = await request(app).post('/api/device-events/sensor').set(headers)
      .send({ eventId: eventId(), pointId: point.id, state: 'OPEN', occurredAt: new Date(now - 60_000).toISOString() });

    expect(old.status).toBe(201);
    expect(old.body.data.applied).toBe(false);
    const saved = await prisma.monitoredPoint.findUniqueOrThrow({ where: { id: point.id } });
    expect(saved.currentState).toBe('CLOSED');
    expect(await prisma.sensorEvent.count()).toBe(2);
  });

  it('rejeita eventos inválidos', async () => {
    const { device, headers } = await createProvisionedDevice();
    const point = await createPoint(device.id);
    const cases = [
      { pointId: point.id, state: 'OPEN' }, // sem eventId
      { eventId: eventId(), pointId: point.id, state: 'ENTREABERTA' },
      { eventId: eventId(), pointId: 'nao-uuid', state: 'OPEN' },
      { eventId: eventId(), pointId: point.id, state: 'OPEN', occurredAt: 'ontem' },
      { eventId: 'com espaço', pointId: point.id, state: 'OPEN' },
    ];
    for (const body of cases) {
      const res = await request(app).post('/api/device-events/sensor').set(headers).send(body);
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
    expect(await prisma.sensorEvent.count()).toBe(0);
  });

  it('rejeita ponto de outro dispositivo', async () => {
    const { headers } = await createProvisionedDevice();
    const other = await createProvisionedDevice('Outro');
    const point = await createPoint(other.device.id);
    const res = await request(app).post('/api/device-events/sensor').set(headers)
      .send({ eventId: eventId(), pointId: point.id, state: 'OPEN' });
    expect(res.status).toBe(403);
  });
});

describe('Eventos de acesso', () => {
  it('registra acesso autorizado com horário do dispositivo e de recebimento', async () => {
    const { device, headers } = await createProvisionedDevice();
    const occurredAt = '2026-11-19T18:31:00.000Z';
    const res = await request(app).post('/api/device-events/access').set(headers)
      .send({ eventId: eventId(), deviceId: device.id, eventType: 'ACCESS_GRANTED', direction: 'UNKNOWN', occurredAt });
    expect(res.status).toBe(201);
    const saved = await prisma.accessEvent.findUniqueOrThrow({ where: { id: res.body.data.id } });
    expect(saved.occurredAt.toISOString()).toBe(occurredAt);
    expect(saved.receivedAt.getTime()).toBeGreaterThan(saved.occurredAt.getTime());
  });

  it('usa o horário de recebimento quando o dispositivo não informa horário confiável', async () => {
    const { headers } = await createProvisionedDevice();
    const future = new Date(Date.now() + 3600_000).toISOString();
    const res = await request(app).post('/api/device-events/access').set(headers)
      .send({ eventId: eventId(), eventType: 'ACCESS_DENIED', occurredAt: future, metadata: { attempt: 1 } });
    const saved = await prisma.accessEvent.findUniqueOrThrow({ where: { id: res.body.data.id } });
    expect(saved.occurredAt.getTime()).toBe(saved.receivedAt.getTime());
  });

  it('registra bloqueio por tentativas inválidas', async () => {
    const { headers } = await createProvisionedDevice();
    const res = await request(app).post('/api/device-events/access').set(headers)
      .send({ eventId: eventId(), eventType: 'LOCKOUT_STARTED', metadata: { failedAttempts: 3, lockoutSeconds: 60 } });
    expect(res.status).toBe(201);
  });

  it('é idempotente para eventos de acesso', async () => {
    const { headers } = await createProvisionedDevice();
    const body = { eventId: 'boot2-7', eventType: 'ACCESS_GRANTED' };
    await request(app).post('/api/device-events/access').set(headers).send(body);
    const again = await request(app).post('/api/device-events/access').set(headers).send(body);
    expect(again.status).toBe(200);
    expect(again.body.data.duplicate).toBe(true);
    expect(await prisma.accessEvent.count()).toBe(1);
  });
});

describe('Payloads não aceitam senha digitada nem segredos', () => {
  const forbiddenFields = ['password', 'senha', 'pin', 'code', 'typedPassword', 'deviceKey', 'passwordHash'];

  it.each(forbiddenFields)('rejeita evento de acesso com o campo "%s"', async (field) => {
    const { headers } = await createProvisionedDevice();
    const res = await request(app).post('/api/device-events/access').set(headers)
      .send({ eventId: eventId(), eventType: 'ACCESS_DENIED', [field]: '1234' });
    expect(res.status).toBe(400);
    expect(await prisma.accessEvent.count()).toBe(0);
  });

  it('rejeita senha escondida dentro de metadata', async () => {
    const { headers } = await createProvisionedDevice();
    const res = await request(app).post('/api/device-events/access').set(headers)
      .send({ eventId: eventId(), eventType: 'ACCESS_DENIED', metadata: { attempt: 1, typed: '1234' } });
    expect(res.status).toBe(400);
  });

  it('rejeita senha em evento de sensor e heartbeat', async () => {
    const { device, headers } = await createProvisionedDevice();
    const point = await createPoint(device.id);
    const sensor = await request(app).post('/api/device-events/sensor').set(headers)
      .send({ eventId: eventId(), pointId: point.id, state: 'OPEN', password: '1234' });
    const hb = await request(app).post('/api/device-events/heartbeat').set(headers).send({ pin: '1234' });
    expect(sensor.status).toBe(400);
    expect(hb.status).toBe(400);
  });
});
