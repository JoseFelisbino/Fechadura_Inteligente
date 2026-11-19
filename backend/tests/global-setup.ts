import { execSync } from 'node:child_process';
import { testDatabaseUrl } from './test-db-url';

/** Aplica as migrations no schema de testes antes da suíte. */
export default function setup() {
  execSync('npx prisma migrate deploy', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: testDatabaseUrl() },
  });
}
