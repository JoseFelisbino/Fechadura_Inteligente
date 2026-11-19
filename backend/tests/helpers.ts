import bcrypt from 'bcrypt';
import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/config/prisma';
import { generateDeviceKey, hashDeviceKey } from '../src/utils/device-key';

export const app = createApp();
export const CSRF = { 'X-Requested-With': 'XMLHttpRequest' };

export async function resetDb() {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "Alert", "SensorEvent", "AccessEvent", "MonitoredPoint", "Device", "User" RESTART IDENTITY CASCADE',
  );
}

export async function createUser(role: 'ADMIN' | 'VIEWER' = 'ADMIN', password = 'senha-forte-123') {
  const email = `${role.toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@teste.com`;
  const user = await prisma.user.create({
    data: { name: `Usuário ${role}`, email, role, passwordHash: await bcrypt.hash(password, 4) },
  });
  return { user, email, password };
}

/** Retorna um agente supertest já autenticado (cookie salvo). */
export async function loginAgent(role: 'ADMIN' | 'VIEWER' = 'ADMIN') {
  const { email, password, user } = await createUser(role);
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').set(CSRF).send({ email, password });
  if (res.status !== 200) throw new Error(`login falhou: ${res.status}`);
  return { agent, user };
}

export async function createProvisionedDevice(name = 'ESP32 Teste') {
  const key = generateDeviceKey();
  const device = await prisma.device.create({ data: { name, deviceKeyHash: await hashDeviceKey(key) } });
  return { device, key, headers: { 'X-Device-Id': device.id, 'X-Device-Key': key } };
}

export async function createPoint(deviceId: string, overrides: Partial<{ name: string; maxOpenSeconds: number; type: 'DOOR' | 'WINDOW' }> = {}) {
  return prisma.monitoredPoint.create({
    data: {
      name: overrides.name ?? 'Porta principal',
      location: 'Sala',
      type: overrides.type ?? 'DOOR',
      maxOpenSeconds: overrides.maxOpenSeconds ?? 60,
      deviceId,
    },
  });
}

let seq = 0;
export function eventId() {
  seq += 1;
  return `test-${Date.now()}-${seq}`;
}
