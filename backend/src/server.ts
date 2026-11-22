import fs from 'node:fs';
import https from 'node:https';
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

  // Com certificado configurado, a API responde em HTTPS (o app da Vercel só pode chamar https://).
  // Sem certificado, continua em HTTP como antes.
  const usarHttps = Boolean(env.HTTPS_CERT_FILE && env.HTTPS_KEY_FILE);
  const aoIniciar = () => {
    logger.info(`API ouvindo em ${usarHttps ? 'https' : 'http'}://localhost:${env.PORT}/api (${env.NODE_ENV}).`);
  };
  const server = usarHttps
    ? https
        .createServer({ cert: fs.readFileSync(env.HTTPS_CERT_FILE), key: fs.readFileSync(env.HTTPS_KEY_FILE) }, app)
        .listen(env.PORT, aoIniciar)
    : app.listen(env.PORT, aoIniciar);

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
