import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/config/prisma';
import { alertService } from '../src/services/alert.service';
import { checkHeartbeats } from '../src/services/monitor.service';
import { app, createPoint, createProvisionedDevice, CSRF, eventId, loginAgent, resetDb } from './helpers';

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

async function openPoint(maxOpenSeconds = 60) {
  const ctx = await createProvisionedDevice();
  const point = await createPoint(ctx.device.id, { maxOpenSeconds });
  const openedAt = new Date(Date.now() - 1000);
  await request(app).post('/api/device-events/sensor').set(ctx.headers)
    .send({ eventId: eventId(), pointId: point.id, state: 'OPEN', occurredAt: openedAt.toISOString() });
  return { ...ctx, point, openedAt };
}

describe('Alerta de abertura prolongada', () => {
  it('não cria alerta antes do limite', async () => {
    const { openedAt } = await openPoint(60);
    const created = await alertService.checkOpenTooLong(new Date(openedAt.getTime() + 30_000));
    expect(created).toHaveLength(0);
  });

  it('cria um único alerta após o tempo máximo de abertura', async () => {
    const { point, openedAt } = await openPoint(60);
    const later = new Date(openedAt.getTime() + 61_000);

    const first = await alertService.checkOpenTooLong(later);
    const second = await alertService.checkOpenTooLong(new Date(later.getTime() + 60_000));

    expect(first).toHaveLength(1);
    expect(second).toHaveLength(0);
    const alerts = await prisma.alert.findMany({ where: { monitoredPointId: point.id } });
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ type: 'OPEN_TOO_LONG', status: 'ACTIVE' });
  });

  it('resolve o alerta quando o sensor indica fechamento', async () => {
    const { point, openedAt, headers } = await openPoint(60);
    await alertService.checkOpenTooLong(new Date(openedAt.getTime() + 61_000));

    await request(app).post('/api/device-events/sensor').set(headers)
      .send({ eventId: eventId(), pointId: point.id, state: 'CLOSED' });

    const alert = await prisma.alert.findFirstOrThrow({ where: { monitoredPointId: point.id } });
    expect(alert.status).toBe('RESOLVED');
    expect(alert.resolvedAt).not.toBeNull();
  });

  it('nova abertura após fechamento gera nova ocorrência', async () => {
    const { point, openedAt, headers } = await openPoint(60);
    await alertService.checkOpenTooLong(new Date(openedAt.getTime() + 61_000));
    await request(app).post('/api/device-events/sensor').set(headers)
      .send({ eventId: eventId(), pointId: point.id, state: 'CLOSED' });
    const reopenedAt = new Date();
    await request(app).post('/api/device-events/sensor').set(headers)
      .send({ eventId: eventId(), pointId: point.id, state: 'OPEN', occurredAt: reopenedAt.toISOString() });

    await alertService.checkOpenTooLong(new Date(reopenedAt.getTime() + 61_000));
    expect(await prisma.alert.count({ where: { monitoredPointId: point.id } })).toBe(2);
  });

  it('lista alertas ativos e impede resolução manual enquanto o ponto está aberto', async () => {
    const { openedAt } = await openPoint(60);
    await alertService.checkOpenTooLong(new Date(openedAt.getTime() + 61_000));
    const { agent } = await loginAgent('VIEWER');

    const active = await agent.get('/api/alerts/active');
    expect(active.status).toBe(200);
    expect(active.body.data).toHaveLength(1);
    expect(active.body.data[0].monitoredPoint.name).toBe('Porta principal');

    const res = await agent.patch(`/api/alerts/${active.body.data[0].id}/resolve`).set(CSRF).send({});
    expect(res.status).toBe(409);
  });
});

describe('Estado de comunicação', () => {
  it('marca dispositivo sem heartbeat como OFFLINE, pontos como UNKNOWN e gera alerta', async () => {
    const { device, point, headers } = await openPoint(600);
    await request(app).post('/api/device-events/heartbeat').set(headers).send({});

    const stale = await checkHeartbeats(new Date(Date.now() + 91_000));
    expect(stale).toContain(device.id);

    const saved = await prisma.device.findUniqueOrThrow({ where: { id: device.id } });
    expect(saved.status).toBe('OFFLINE');
    const p = await prisma.monitoredPoint.findUniqueOrThrow({ where: { id: point.id } });
    expect(p.currentState).toBe('UNKNOWN');
    expect(p.lastKnownState).toBe('OPEN');
    expect(await prisma.alert.count({ where: { type: 'DEVICE_OFFLINE', status: 'ACTIVE' } })).toBe(1);

    // Volta a comunicar: alerta de offline é resolvido.
    await request(app).post('/api/device-events/heartbeat').set(headers).send({});
    expect(await prisma.alert.count({ where: { type: 'DEVICE_OFFLINE', status: 'ACTIVE' } })).toBe(0);
  });
});

describe('Histórico', () => {
  it('lista eventos unificados com filtros e paginação', async () => {
    const { device, point, headers } = await openPoint(600);
    await request(app).post('/api/device-events/access').set(headers)
      .send({ eventId: eventId(), eventType: 'ACCESS_GRANTED' });
    await request(app).post('/api/device-events/access').set(headers)
      .send({ eventId: eventId(), eventType: 'ACCESS_DENIED' });

    const { agent } = await loginAgent('VIEWER');
    const all = await agent.get('/api/events');
    expect(all.status).toBe(200);
    expect(all.body.meta.total).toBe(3);

    const denied = await agent.get('/api/events').query({ result: 'FAILURE' });
    expect(denied.body.data).toHaveLength(1);
    expect(denied.body.data[0].eventType).toBe('ACCESS_DENIED');

    const sensors = await agent.get('/api/events').query({ pointId: point.id, state: 'OPEN' });
    expect(sensors.body.data).toHaveLength(1);
    expect(sensors.body.data[0]).toMatchObject({ category: 'SENSOR', pointName: 'Porta principal' });

    const byDevice = await agent.get('/api/events').query({ deviceId: device.id, pageSize: 2, page: 2 });
    expect(byDevice.body.data).toHaveLength(1);
    expect(byDevice.body.meta).toMatchObject({ page: 2, pageSize: 2, total: 3 });

    const future = await agent.get('/api/events').query({ from: new Date(Date.now() + 86400_000).toISOString() });
    expect(future.body.data).toHaveLength(0);

    const invalid = await agent.get('/api/events').query({ eventType: 'QUALQUER' });
    expect(invalid.status).toBe(400);
  });

  it('permite confirmar a direção de um acesso autorizado pelo painel', async () => {
    const { headers } = await createProvisionedDevice();
    const created = await request(app).post('/api/device-events/access').set(headers)
      .send({ eventId: eventId(), eventType: 'ACCESS_GRANTED' });
    const { agent } = await loginAgent('VIEWER');
    const res = await agent.patch(`/api/events/access/${created.body.data.id}/direction`).set(CSRF).send({ direction: 'ENTRY' });
    expect(res.status).toBe(200);
    expect(res.body.data.direction).toBe('ENTRY');
  });
});
