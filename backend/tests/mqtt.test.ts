import crypto from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/config/prisma';
import { handleMqttMessage } from '../src/mqtt/handlers';
import { parseTopic } from '../src/mqtt/topics';
import { mosquittoPasswordEntry } from '../src/utils/mosquitto-passwd';
import { createPoint, createProvisionedDevice, eventId, resetDb } from './helpers';

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

describe('Tópicos MQTT', () => {
  it('extrai deviceId e tipo do tópico', () => {
    const id = crypto.randomUUID();
    expect(parseTopic(`home/devices/${id}/events/access`)).toEqual({ deviceId: id, kind: 'access' });
    expect(parseTopic(`home/devices/${id}/events/sensors`)).toEqual({ deviceId: id, kind: 'sensors' });
    expect(parseTopic(`home/devices/${id}/status`)).toEqual({ deviceId: id, kind: 'status' });
    expect(parseTopic('home/devices/abc/status')).toBeNull();
    expect(parseTopic(`home/devices/${id}/commands/open`)).toBeNull();
  });

  it('gera entrada no formato PBKDF2-SHA512 do mosquitto_passwd', () => {
    const line = mosquittoPasswordEntry('device', 'senha');
    const [, rest] = line.split(':');
    const [, type, iterations, salt, hash] = rest.split('$');
    expect(type).toBe('7');
    expect(iterations).toBe('101');
    const expected = crypto.pbkdf2Sync('senha', Buffer.from(salt, 'base64'), 101, 64, 'sha512');
    expect(hash).toBe(expected.toString('base64'));
  });
});

describe('Ingestão via MQTT', () => {
  it('processa evento de sensor e ignora payload com senha', async () => {
    const { device } = await createProvisionedDevice();
    const point = await createPoint(device.id);
    const topic = `home/devices/${device.id}/events/sensors`;

    await handleMqttMessage(topic, Buffer.from(JSON.stringify({ eventId: eventId(), pointId: point.id, state: 'OPEN' })));
    await handleMqttMessage(topic, Buffer.from(JSON.stringify({ eventId: eventId(), pointId: point.id, state: 'CLOSED', password: '1234' })));
    await handleMqttMessage(topic, Buffer.from('não é json'));

    expect(await prisma.sensorEvent.count()).toBe(1);
    const saved = await prisma.monitoredPoint.findUniqueOrThrow({ where: { id: point.id } });
    expect(saved.currentState).toBe('OPEN');
  });

  it('testamento OFFLINE marca o dispositivo sem comunicação', async () => {
    const { device } = await createProvisionedDevice();
    const topic = `home/devices/${device.id}/status`;
    await handleMqttMessage(topic, Buffer.from(JSON.stringify({ status: 'ONLINE' })));
    await handleMqttMessage(topic, Buffer.from(JSON.stringify({ status: 'OFFLINE' })));
    const saved = await prisma.device.findUniqueOrThrow({ where: { id: device.id } });
    expect(saved.status).toBe('OFFLINE');
  });
});
