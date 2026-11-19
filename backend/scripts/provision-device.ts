import 'dotenv/config';
import { parseArgs } from 'node:util';
import { PrismaClient } from '@prisma/client';
import { generateDeviceKey, hashDeviceKey } from '../src/utils/device-key';
import { upsertMosquittoUser } from '../src/utils/mosquitto-passwd';

/**
 * Gera (ou rotaciona) a credencial de um dispositivo.
 *
 *   npm run device:provision -- --id <uuid>            # dispositivo já cadastrado no painel
 *   npm run device:provision -- --name "ESP32 Porta"   # cadastra e provisiona
 *
 * A credencial é exibida UMA única vez neste terminal. O banco guarda somente o hash bcrypt
 * e o arquivo do Mosquitto guarda somente o hash PBKDF2. Ela nunca passa pelo frontend.
 */
async function main() {
  const { values } = parseArgs({
    options: {
      id: { type: 'string' },
      name: { type: 'string' },
    },
  });

  if (!values.id && !values.name) {
    console.error('Uso: npm run device:provision -- --id <uuid>  |  --name "<nome>"');
    process.exit(1);
  }

  const prisma = new PrismaClient();
  const key = generateDeviceKey();
  const deviceKeyHash = await hashDeviceKey(key);

  const device = values.id
    ? await prisma.device.update({ where: { id: values.id }, data: { deviceKeyHash } })
    : await prisma.device.create({ data: { name: values.name!, deviceKeyHash } });

  const passwdFile = process.env.MOSQUITTO_PASSWD_FILE;
  if (passwdFile) {
    upsertMosquittoUser(passwdFile, device.id, key);
  }

  console.log('\nDispositivo provisionado.');
  console.log(`  DEVICE_ID  = ${device.id}`);
  console.log(`  DEVICE_KEY = ${key}`);
  console.log('\nCopie a DEVICE_KEY agora para firmware/fechadura_esp32/include/secrets.h.');
  console.log('Ela não será exibida novamente; para trocar, rode este comando de novo.');
  if (passwdFile) {
    console.log(`\nArquivo do Mosquitto atualizado (${passwdFile}).`);
    console.log('Recarregue o broker: docker compose kill -s SIGHUP mosquitto');
  }
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
