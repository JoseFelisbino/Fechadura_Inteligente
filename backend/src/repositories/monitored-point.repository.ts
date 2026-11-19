import type { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';

const include = {
  device: { select: { id: true, name: true, status: true, lastSeenAt: true } },
} as const;

export type PointWithDevice = Prisma.MonitoredPointGetPayload<{ include: typeof include }>;

export const monitoredPointRepository = {
  list() {
    return prisma.monitoredPoint.findMany({ orderBy: [{ location: 'asc' }, { name: 'asc' }], include });
  },
  findById(id: string) {
    return prisma.monitoredPoint.findUnique({ where: { id }, include });
  },
  create(data: Prisma.MonitoredPointUncheckedCreateInput) {
    return prisma.monitoredPoint.create({ data, include });
  },
  update(id: string, data: Prisma.MonitoredPointUncheckedUpdateInput) {
    return prisma.monitoredPoint.update({ where: { id }, data, include });
  },
  findOpen() {
    return prisma.monitoredPoint.findMany({
      where: { currentState: 'OPEN', stateChangedAt: { not: null } },
      include,
    });
  },
};
