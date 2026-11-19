import type { AlertStatus, AlertType, Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';

const include = {
  monitoredPoint: { select: { id: true, name: true, location: true, type: true } },
  device: { select: { id: true, name: true } },
  resolvedBy: { select: { id: true, name: true } },
} as const;

export type AlertWithRelations = Prisma.AlertGetPayload<{ include: typeof include }>;

export const alertRepository = {
  async list(filter: { status?: AlertStatus; type?: AlertType }, skip: number, take: number) {
    const where: Prisma.AlertWhereInput = { status: filter.status, type: filter.type };
    const [items, total] = await prisma.$transaction([
      prisma.alert.findMany({ where, include, orderBy: { createdAt: 'desc' }, skip, take }),
      prisma.alert.count({ where }),
    ]);
    return { items, total };
  },
  listActive() {
    return prisma.alert.findMany({ where: { status: 'ACTIVE' }, include, orderBy: { createdAt: 'desc' } });
  },
  findById(id: string) {
    return prisma.alert.findUnique({ where: { id }, include });
  },
  findExistingKeys(keys: string[]) {
    return prisma.alert.findMany({ where: { occurrenceKey: { in: keys } }, select: { occurrenceKey: true } });
  },
  create(data: Prisma.AlertUncheckedCreateInput) {
    return prisma.alert.create({ data, include });
  },
  resolve(id: string, data: { resolvedAt: Date; resolvedById?: string; resolutionNote?: string }) {
    return prisma.alert.update({ where: { id }, data: { status: 'RESOLVED', ...data }, include });
  },
  /** Resolve todos os alertas ativos que casam com o filtro e retorna os resolvidos. */
  async resolveActiveWhere(where: Prisma.AlertWhereInput, resolvedAt: Date, note: string) {
    const active = await prisma.alert.findMany({ where: { ...where, status: 'ACTIVE' }, select: { id: true } });
    if (active.length === 0) return [];
    await prisma.alert.updateMany({
      where: { id: { in: active.map((a) => a.id) }, status: 'ACTIVE' },
      data: { status: 'RESOLVED', resolvedAt, resolutionNote: note },
    });
    return active.map((a) => a.id);
  },
};
