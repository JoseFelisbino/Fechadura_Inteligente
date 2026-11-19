import { prisma } from '../config/prisma';
import { alertRepository } from '../repositories/alert.repository';
import { monitoredPointRepository } from '../repositories/monitored-point.repository';
import { HttpError } from '../utils/http-error';
import type { AlertQuery } from '../validators/alert.validator';
import { realtime } from './realtime.service';

export function formatDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const parts: string[] = [];
  if (h) parts.push(`${h} h`);
  if (m) parts.push(`${m} min`);
  if (s || parts.length === 0) parts.push(`${s} s`);
  return parts.join(' ');
}

/** Chave da ocorrência: uma abertura = um alerta, mesmo que seja resolvido manualmente. */
export function openTooLongKey(pointId: string, openedAt: Date) {
  return `OPEN_TOO_LONG:${pointId}:${openedAt.toISOString()}`;
}

export const alertService = {
  async list(q: AlertQuery) {
    const { items, total } = await alertRepository.list(
      { status: q.status, type: q.type },
      (q.page - 1) * q.pageSize,
      q.pageSize,
    );
    return { items, meta: { page: q.page, pageSize: q.pageSize, total } };
  },

  listActive() {
    return alertRepository.listActive();
  },

  /**
   * Resolução manual pelo painel. Um alerta de abertura prolongada só pode ser
   * resolvido manualmente quando o ponto não está mais informando ABERTO; enquanto
   * estiver aberto, a resolução acontece automaticamente no fechamento.
   */
  async resolve(id: string, userId: string, note?: string, now = new Date()) {
    const alert = await alertRepository.findById(id);
    if (!alert) throw HttpError.notFound('Alerta não encontrado.');
    if (alert.status === 'RESOLVED') throw HttpError.conflict('O alerta já está resolvido.');

    if (alert.type === 'OPEN_TOO_LONG' && alert.monitoredPointId) {
      const point = await prisma.monitoredPoint.findUnique({ where: { id: alert.monitoredPointId } });
      if (point?.currentState === 'OPEN') {
        throw HttpError.conflict('O ponto ainda está aberto. O alerta será resolvido ao fechar.');
      }
    }

    const resolved = await alertRepository.resolve(id, {
      resolvedAt: now,
      resolvedById: userId,
      resolutionNote: note ?? 'Resolvido manualmente no painel.',
    });
    realtime.publish('alert-resolved', { alertId: id });
    return resolved;
  },

  /** Resolve automaticamente alertas de abertura prolongada quando o sensor indica fechamento. */
  async resolveOpenTooLongForPoint(pointId: string, now = new Date()) {
    const ids = await alertRepository.resolveActiveWhere(
      { monitoredPointId: pointId, type: 'OPEN_TOO_LONG' },
      now,
      'Fechamento detectado pelo sensor.',
    );
    ids.forEach((alertId) => realtime.publish('alert-resolved', { alertId }));
    return ids;
  },

  /**
   * Gera alertas para pontos abertos além do limite. Idempotente: a chave única
   * `occurrenceKey` impede alertas duplicados para a mesma abertura.
   */
  async checkOpenTooLong(now = new Date()) {
    const open = await monitoredPointRepository.findOpen();
    const overdue = open.filter(
      (p) => p.stateChangedAt && now.getTime() - p.stateChangedAt.getTime() >= p.maxOpenSeconds * 1000,
    );
    if (overdue.length === 0) return [];

    const keys = overdue.map((p) => openTooLongKey(p.id, p.stateChangedAt!));
    const existing = new Set((await alertRepository.findExistingKeys(keys)).map((a) => a.occurrenceKey));

    const created = [];
    for (const point of overdue) {
      const key = openTooLongKey(point.id, point.stateChangedAt!);
      if (existing.has(key)) continue;
      const kind = point.type === 'DOOR' ? 'Porta' : 'Janela';
      try {
        const alert = await alertRepository.create({
          type: 'OPEN_TOO_LONG',
          monitoredPointId: point.id,
          deviceId: point.deviceId,
          occurrenceKey: key,
          message: `${kind} "${point.name}" (${point.location}) aberta há mais de ${formatDuration(point.maxOpenSeconds)}.`,
          createdAt: now,
        });
        created.push(alert);
        realtime.publish('alert-created', { alertId: alert.id, type: alert.type, pointId: point.id });
      } catch (err) {
        // Outra execução criou o mesmo alerta ao mesmo tempo.
        if ((err as { code?: string }).code !== 'P2002') throw err;
      }
    }
    return created;
  },
};
