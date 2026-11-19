import mqtt, { type MqttClient } from 'mqtt';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { handleMqttMessage } from './handlers';
import { SUBSCRIPTIONS } from './topics';

let client: MqttClient | null = null;

export function startMqtt(): MqttClient | null {
  if (!env.MQTT_URL) {
    logger.info('MQTT desabilitado (MQTT_URL vazio). Usando somente as rotas HTTP de dispositivos.');
    return null;
  }

  client = mqtt.connect(env.MQTT_URL, {
    username: env.MQTT_USERNAME || undefined,
    password: env.MQTT_PASSWORD || undefined,
    clientId: `fechadura-backend-${process.pid}`,
    clean: false, // sessão persistente: recebe mensagens QoS 1 enviadas enquanto o backend estava fora
    reconnectPeriod: 5000,
    connectTimeout: 10_000,
  });

  client.on('connect', () => {
    logger.info(`MQTT conectado em ${env.MQTT_URL}.`);
    client!.subscribe(SUBSCRIPTIONS, { qos: 1 }, (err) => {
      if (err) logger.error('MQTT: falha ao assinar tópicos', { message: err.message });
    });
  });

  client.on('message', (topic, payload) => {
    handleMqttMessage(topic, payload).catch((err) =>
      logger.error(`MQTT: erro ao processar ${topic}`, { message: (err as Error).message }),
    );
  });

  client.on('reconnect', () => logger.warn('MQTT: reconectando...'));
  client.on('error', (err) => logger.error('MQTT: erro de conexão', { message: err.message }));

  return client;
}

export async function stopMqtt() {
  if (client) await client.endAsync();
  client = null;
}
