import type { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';

export const deviceRepository = {
  list() {
    return prisma.device.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { points: true } } },
    });
  },
  findById(id: string) {
    return prisma.device.findUnique({
      where: { id },
      include: { _count: { select: { points: true } } },
    });
  },
  create(data: Prisma.DeviceCreateInput) {
    return prisma.device.create({ data, include: { _count: { select: { points: true } } } });
  },
  update(id: string, data: Prisma.DeviceUpdateInput) {
    return prisma.device.update({
      where: { id },
      data,
      include: { _count: { select: { points: true } } },
    });
  },
  /** Marca a última comunicação e retorna o estado anterior. */
  async markSeen(id: string, now: Date) {
    const before = await prisma.device.findUnique({ where: { id }, select: { status: true } });
    await prisma.device.update({ where: { id }, data: { lastSeenAt: now, status: 'ONLINE' } });
    return before?.status ?? null;
  },
  findStaleOnline(cutoff: Date) {
    return prisma.device.findMany({
      where: {
        status: 'ONLINE',
        OR: [{ lastSeenAt: null }, { lastSeenAt: { lt: cutoff } }],
      },
    });
  },
  /** Marca o dispositivo como offline e seus pontos como sem comunicação. */
  markOffline(id: string) {
    return prisma.$transaction([
      prisma.device.update({ where: { id }, data: { status: 'OFFLINE' } }),
      prisma.monitoredPoint.updateMany({ where: { deviceId: id }, data: { currentState: 'UNKNOWN' } }),
    ]);
  },
};
