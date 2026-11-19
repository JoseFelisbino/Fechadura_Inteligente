import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET deve ter pelo menos 16 caracteres'),
  JWT_EXPIRES_IN_SECONDS: z.coerce.number().int().positive().default(8 * 60 * 60),
  FRONTEND_URL: z.string().url().default('http://localhost:5173'),
  COOKIE_NAME: z.string().min(1).default('access_token'),

  HEARTBEAT_TIMEOUT_SECONDS: z.coerce.number().int().positive().default(90),
  MONITOR_INTERVAL_SECONDS: z.coerce.number().int().positive().default(5),
  DEFAULT_MAX_OPEN_SECONDS: z.coerce.number().int().positive().default(300),

  MQTT_URL: z.string().optional().default(''),
  MQTT_USERNAME: z.string().optional().default(''),
  MQTT_PASSWORD: z.string().optional().default(''),
  MOSQUITTO_PASSWD_FILE: z.string().optional().default(''),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // Mostra somente os nomes das variáveis com problema, nunca os valores.
  const problems = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
  console.error(`Variáveis de ambiente inválidas:\n- ${problems.join('\n- ')}`);
  process.exit(1);
}

if (parsed.data.NODE_ENV === 'production' && parsed.data.JWT_SECRET.startsWith('alterar_este_segredo')) {
  console.error('JWT_SECRET de exemplo não pode ser usado em produção.');
  process.exit(1);
}

export const env = parsed.data;
export const isProduction = env.NODE_ENV === 'production';
