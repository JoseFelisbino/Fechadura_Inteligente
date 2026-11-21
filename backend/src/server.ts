import { createApp } from './app';
import { env } from './config/env';
import { prisma } from './config/prisma';
import { iniciarMqtt, pararMqtt } from './mqtt/client';
import { garantirDadosIniciais } from './services/configuracao.service';
import { iniciarMonitor, pararMonitor } from './services/monitor.service';
import { logger } from './utils/logger';

async function main() {
  await prisma.$connect();
  await garantirDadosIniciais();
  const app = createApp();
  const server = app.listen(env.PORT, () => {
    logger.info(`API ouvindo em http://localhost:${env.PORT}/api (${env.NODE_ENV}).`);
  });

  iniciarMonitor();
  iniciarMqtt();

  const encerrar = async (sinal: string) => {
    logger.info(`Recebido ${sinal}, encerrando...`);
    pararMonitor();
    await pararMqtt().catch(() => undefined);
    server.close();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on('SIGINT', () => void encerrar('SIGINT'));
  process.on('SIGTERM', () => void encerrar('SIGTERM'));
}

main().catch((err) => {
  logger.error('Falha ao iniciar o servidor', { message: (err as Error).message });
  process.exit(1);
});
