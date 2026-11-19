import 'dotenv/config';
import { parseArgs } from 'node:util';
import bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';

/**
 * Cria ou atualiza um usuário do painel.
 *   npm run user:create -- --name "Maria" --email maria@exemplo.com --role VIEWER
 * A senha é lida da variável NEW_USER_PASSWORD (para não ficar no histórico do shell).
 */
async function main() {
  const { values } = parseArgs({
    options: {
      name: { type: 'string' },
      email: { type: 'string' },
      role: { type: 'string', default: 'VIEWER' },
    },
  });
  const password = process.env.NEW_USER_PASSWORD ?? '';
  const role = values.role === 'ADMIN' ? 'ADMIN' : 'VIEWER';

  if (!values.name || !values.email || password.length < 10) {
    console.error('Uso: NEW_USER_PASSWORD=<senha com 10+ caracteres> npm run user:create -- --name <nome> --email <email> [--role ADMIN|VIEWER]');
    process.exit(1);
  }

  const prisma = new PrismaClient();
  const email = values.email.trim().toLowerCase();
  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.upsert({
    where: { email },
    update: { name: values.name, passwordHash, role },
    create: { name: values.name, email, passwordHash, role },
  });
  console.log(`Usuário ${user.email} (${user.role}) salvo.`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
