import 'dotenv/config';
import bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';

/**
 * Cria (ou atualiza) o usuário administrador a partir das variáveis
 * SEED_ADMIN_NAME, SEED_ADMIN_EMAIL e SEED_ADMIN_PASSWORD.
 * Não cria dispositivos, pontos ou eventos fictícios.
 */
async function main() {
  const prisma = new PrismaClient();
  const name = process.env.SEED_ADMIN_NAME || 'Administrador';
  const email = (process.env.SEED_ADMIN_EMAIL || '').trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD || '';

  if (!email || password.length < 10) {
    console.error('Defina SEED_ADMIN_EMAIL e SEED_ADMIN_PASSWORD (mínimo 10 caracteres) no .env.');
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.upsert({
    where: { email },
    update: { name, passwordHash, role: 'ADMIN' },
    create: { name, email, passwordHash, role: 'ADMIN' },
  });
  console.log(`Administrador pronto: ${user.email}`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
