import 'dotenv/config';

/** URL do banco de testes (schema separado). Nunca usa o banco de desenvolvimento. */
export function testDatabaseUrl(): string {
  const url = process.env.DATABASE_URL_TEST;
  if (!url) {
    throw new Error('Defina DATABASE_URL_TEST no .env (ex.: ...fechadura_inteligente?schema=test).');
  }
  if (url === process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL_TEST deve ser diferente de DATABASE_URL.');
  }
  return url;
}
