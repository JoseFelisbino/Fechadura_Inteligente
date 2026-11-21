import mqtt, { type MqttClient } from 'mqtt';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { tratarMensagemMqtt } from './handlers';
import { ASSINATURAS } from './topicos';
import { transporte } from './transporte';

let client: MqttClient | null = null;

export function iniciarMqtt(): MqttClient | null {
  if (!env.MQTT_URL) {
    logger.info('MQTT desabilitado (MQTT_URL vazio).');
    return null;
  }

  client = mqtt.connect(env.MQTT_URL, {
    username: env.MQTT_USERNAME || undefined,
    password: env.MQTT_PASSWORD || undefined,
    clientId: 'fechadura-backend',
    clean: false, // sessão persistente: recebe os eventos (QoS 1) enviados enquanto o backend estava fora
    reconnectPeriod: 5000,
    connectTimeout: 10_000,
  });

  transporte.definir((topico, mensagem) => {
    if (!client?.connected) return false;
    client.publish(topico, mensagem, { qos: 1 });
    return true;
  });

  client.on('connect', () => {
    logger.info(`MQTT conectado em ${env.MQTT_URL}.`);
    client!.subscribe(ASSINATURAS, { qos: 1 }, (err) => {
      if (err) logger.error('MQTT: falha ao assinar tópicos', { message: err.message });
    });
  });

  client.on('message', (topico, payload) => {
    tratarMensagemMqtt(topico, payload).catch((err) =>
      logger.error(`MQTT: erro ao processar ${topico}`, { message: (err as Error).message }),
    );
  });

  client.on('reconnect', () => logger.warn('MQTT: reconectando...'));
  client.on('error', (err) => logger.error('MQTT: erro de conexão', { message: err.message }));

  return client;
}

export async function pararMqtt() {
  if (client) await client.endAsync();
  client = null;
}
