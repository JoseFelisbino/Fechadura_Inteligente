import { prisma } from '../config/prisma';
import { deviceEventService } from '../services/device-event.service';
import { HttpError } from '../utils/http-error';
import { logger } from '../utils/logger';
import { accessEventSchema, heartbeatSchema, sensorEventSchema } from '../validators/device-event.validator';
import { parseTopic } from './topics';

/**
 * Traduz mensagens MQTT em chamadas aos serviços de negócio.
 * Esta camada conhece somente o protocolo; as regras ficam em `services/`.
 */
export async function handleMqttMessage(topic: string, payload: Buffer): Promise<void> {
  const parsedTopic = parseTopic(topic);
  if (!parsedTopic) {
    logger.warn(`MQTT: tópico ignorado (${topic}).`);
    return;
  }

  // A identidade foi verificada pelo broker (usuário/senha + ACL por deviceId).
  // Aqui garantimos que o dispositivo existe e foi provisionado.
  const device = await prisma.device.findUnique({
    where: { id: parsedTopic.deviceId },
    select: { id: true, name: true, deviceKeyHash: true },
  });
  if (!device?.deviceKeyHash) {
    logger.warn(`MQTT: mensagem de dispositivo não provisionado (${parsedTopic.deviceId}).`);
    return;
  }
  const authDevice = { id: device.id, name: device.name };

  let body: unknown;
  try {
    body = JSON.parse(payload.toString('utf8'));
  } catch {
    logger.warn(`MQTT: JSON inválido em ${topic}.`);
    return;
  }

  try {
    if (parsedTopic.kind === 'access') {
      const input = accessEventSchema.safeParse(body);
      if (!input.success) return logInvalid(topic, input.error.issues);
      await deviceEventService.ingestAccess(authDevice, input.data);
    } else if (parsedTopic.kind === 'sensors') {
      const input = sensorEventSchema.safeParse(body);
      if (!input.success) return logInvalid(topic, input.error.issues);
      await deviceEventService.ingestSensor(authDevice, input.data);
    } else {
      const input = heartbeatSchema.safeParse(body);
      if (!input.success) return logInvalid(topic, input.error.issues);
      await deviceEventService.heartbeat(authDevice, input.data);
    }
  } catch (err) {
    if (err instanceof HttpError) {
      logger.warn(`MQTT: evento rejeitado em ${topic}: ${err.message}`);
      return;
    }
    throw err;
  }
}

function logInvalid(topic: string, issues: { path: (string | number)[]; message: string }[]) {
  // Registra somente caminho e mensagem, nunca os valores recebidos.
  logger.warn(`MQTT: payload inválido em ${topic}`, issues.map((i) => ({ field: i.path.join('.'), message: i.message })));
}
