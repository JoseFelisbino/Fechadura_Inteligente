import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';
import type { EventQuery } from '../validators/event.validator';

export interface UnifiedEventRow {
  id: string;
  category: 'ACCESS' | 'SENSOR';
  eventType: string;
  result: 'SUCCESS' | 'FAILURE' | null;
  state: 'OPEN' | 'CLOSED' | null;
  direction: 'ENTRY' | 'EXIT' | 'UNKNOWN' | null;
  deviceId: string;
  deviceName: string;
  pointId: string | null;
  pointName: string | null;
  pointLocation: string | null;
  occurredAt: Date;
  receivedAt: Date;
  metadata: Prisma.JsonValue | null;
}

/**
 * Une eventos de acesso e de sensores em uma única linha do tempo, com filtros e paginação
 * feitos no PostgreSQL. Todos os valores são parametrizados por `Prisma.sql`.
 */
function buildUnifiedQuery(q: Omit<EventQuery, 'page' | 'pageSize'>) {
  const conditions: Prisma.Sql[] = [];
  if (q.from) conditions.push(Prisma.sql`e."occurredAt" >= ${q.from}`);
  if (q.to) conditions.push(Prisma.sql`e."occurredAt" <= ${q.to}`);
  if (q.deviceId) conditions.push(Prisma.sql`e."deviceId" = ${q.deviceId}::uuid`);
  if (q.pointId) conditions.push(Prisma.sql`e."pointId" = ${q.pointId}::uuid`);
  if (q.category) conditions.push(Prisma.sql`e.category = ${q.category}`);
  if (q.eventType) conditions.push(Prisma.sql`e."eventType" = ${q.eventType}`);
  if (q.result) conditions.push(Prisma.sql`e.result = ${q.result}`);
  if (q.state) conditions.push(Prisma.sql`e.state = ${q.state}`);

  const where = conditions.length ? Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}` : Prisma.empty;

  const base = Prisma.sql`
    WITH e AS (
      SELECT a.id, 'ACCESS'::text AS category, a."eventType"::text AS "eventType",
             CASE WHEN a."eventType" IN ('ACCESS_GRANTED', 'LOCK_RELEASED') THEN 'SUCCESS'
                  WHEN a."eventType" IN ('ACCESS_DENIED', 'LOCKOUT_STARTED') THEN 'FAILURE'
                  ELSE NULL END AS result,
             NULL::text AS state, a.direction::text AS direction,
             a."deviceId", d.name AS "deviceName",
             NULL::uuid AS "pointId", NULL::text AS "pointName", NULL::text AS "pointLocation",
             a."occurredAt", a."receivedAt", a.metadata
        FROM "AccessEvent" a
        JOIN "Device" d ON d.id = a."deviceId"
      UNION ALL
      SELECT s.id, 'SENSOR'::text, 'SENSOR_STATE_CHANGED'::text, NULL::text,
             s.state::text, NULL::text,
             s."deviceId", d.name,
             p.id, p.name, p.location,
             s."occurredAt", s."receivedAt", NULL::jsonb
        FROM "SensorEvent" s
        JOIN "Device" d ON d.id = s."deviceId"
        JOIN "MonitoredPoint" p ON p.id = s."monitoredPointId"
    )`;

  return { base, where };
}

export const eventRepository = {
  async listUnified(q: EventQuery) {
    const { base, where } = buildUnifiedQuery(q);
    const offset = (q.page - 1) * q.pageSize;
    const [items, countRows] = await Promise.all([
      prisma.$queryRaw<UnifiedEventRow[]>`${base}
        SELECT * FROM e ${where}
        ORDER BY e."occurredAt" DESC, e."receivedAt" DESC, e.id
        LIMIT ${q.pageSize} OFFSET ${offset}`,
      prisma.$queryRaw<{ total: bigint }[]>`${base} SELECT COUNT(*)::bigint AS total FROM e ${where}`,
    ]);
    return { items, total: Number(countRows[0]?.total ?? 0) };
  },

  findAccessByExternalId(deviceId: string, externalEventId: string) {
    return prisma.accessEvent.findUnique({ where: { deviceId_externalEventId: { deviceId, externalEventId } } });
  },
  createAccess(data: Prisma.AccessEventUncheckedCreateInput) {
    return prisma.accessEvent.create({ data });
  },
  findAccessById(id: string) {
    return prisma.accessEvent.findUnique({ where: { id } });
  },
  updateAccessDirection(id: string, data: Prisma.AccessEventUncheckedUpdateInput) {
    return prisma.accessEvent.update({ where: { id }, data });
  },

  findSensorByExternalId(deviceId: string, externalEventId: string) {
    return prisma.sensorEvent.findUnique({ where: { deviceId_externalEventId: { deviceId, externalEventId } } });
  },
};
