import { env } from '../config/env';
import { deviceRepository } from '../repositories/device.repository';
import { logger } from '../utils/logger';
import { alertService } from './alert.service';
import { deviceService } from './device.service';

/** Marca como sem comunicação os dispositivos cujo heartbeat expirou. */
export async function checkHeartbeats(now = new Date()) {
  const cutoff = new Date(now.getTime() - env.HEARTBEAT_TIMEOUT_SECONDS * 1000);
  const stale = await deviceRepository.findStaleOnline(cutoff);
  for (const device of stale) {
    await deviceService.markOffline(device.id, `sem heartbeat há mais de ${env.HEARTBEAT_TIMEOUT_SECONDS} s`, now);
  }
  return stale.map((d) => d.id);
}

export async function runMonitorCycle(now = new Date()) {
  await checkHeartbeats(now);
  await alertService.checkOpenTooLong(now);
}

let timer: NodeJS.Timeout | null = null;
let running = false;

export function startMonitor() {
  if (timer) return;
  timer = setInterval(async () => {
    if (running) return; // evita execuções sobrepostas
    running = true;
    try {
      await runMonitorCycle();
    } catch (err) {
      logger.error('Falha no ciclo de monitoramento', { message: (err as Error).message });
    } finally {
      running = false;
    }
  }, env.MONITOR_INTERVAL_SECONDS * 1000);
  logger.info(`Monitor iniciado (intervalo ${env.MONITOR_INTERVAL_SECONDS} s).`);
}

export function stopMonitor() {
  if (timer) clearInterval(timer);
  timer = null;
}
