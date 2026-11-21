import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1),

  // Broker MQTT (deixe MQTT_URL vazio para rodar a API sem broker)
  MQTT_URL: z.string().optional().default(''),
  MQTT_USERNAME: z.string().optional().default(''),
  MQTT_PASSWORD: z.string().optional().default(''),

  // Regras de tempo
  OFFLINE_APOS_SEGUNDOS: z.coerce.number().int().positive().default(15),
  COMANDO_EXPIRA_SEGUNDOS: z.coerce.number().int().positive().default(15),
  MONITOR_INTERVALO_MS: z.coerce.number().int().positive().default(1000),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // Mostra somente os nomes das variáveis com problema, nunca os valores.
  const problems = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
  console.error(`Variáveis de ambiente inválidas:\n- ${problems.join('\n- ')}`);
  process.exit(1);
}

export const env = parsed.data;
export const isProduction = env.NODE_ENV === 'production';
