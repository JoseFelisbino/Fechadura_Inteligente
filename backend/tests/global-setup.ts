import { execSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { testDatabaseUrl } from './test-db-url';

/**
 * Recria o schema de TESTES do zero e aplica as migrations antes da suíte.
 * Só mexe no schema indicado em DATABASE_URL_TEST (nunca em "public" nem no DATABASE_URL).
 */
export default async function setup() {
  const url = testDatabaseUrl();
  const schema = new URL(url).searchParams.get('schema');
  if (!schema || schema === 'public') {
    throw new Error('DATABASE_URL_TEST precisa de ?schema=<nome> diferente de "public".');
  }

  const prisma = new PrismaClient({ datasourceUrl: url });
  await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema.replace(/"/g, '')}" CASCADE`);
  await prisma.$disconnect();

  execSync('npx prisma migrate deploy', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: url },
  });
}
