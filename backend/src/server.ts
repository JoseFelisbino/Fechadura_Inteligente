import { createApp } from './app';
import { env } from './config/env';
import { prisma } from './config/prisma';
import { startMqtt, stopMqtt } from './mqtt/client';
import { startMonitor, stopMonitor } from './services/monitor.service';
import { logger } from './utils/logger';

async function main() {
  await prisma.$connect();
  const app = createApp();
  const server = app.listen(env.PORT, () => {
    logger.info(`API ouvindo em http://localhost:${env.PORT}/api (${env.NODE_ENV}).`);
  });

  startMonitor();
  startMqtt();

  const shutdown = async (signal: string) => {
    logger.info(`Recebido ${signal}, encerrando...`);
    stopMonitor();
    await stopMqtt().catch(() => undefined);
    server.close();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.error('Falha ao iniciar o servidor', { message: (err as Error).message });
  process.exit(1);
});
