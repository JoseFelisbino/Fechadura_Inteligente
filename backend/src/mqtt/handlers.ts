import type { ZodTypeAny, z } from 'zod';
import { responderComando } from '../services/comando.service';
import { marcarOffline, receberEstado } from '../services/estado.service';
import { registrarEvento } from '../services/evento.service';
import { aoFinalizarComando } from '../services/senha.service';
import { logger } from '../utils/logger';
import { estadoMqttSchema, eventoMqttSchema, respostaMqttSchema, statusMqttSchema } from '../validators';
import { TOPICOS } from './topicos';

function lerJson<S extends ZodTypeAny>(topico: string, payload: Buffer, schema: S): z.infer<S> | null {
  let json: unknown;
  try {
    json = JSON.parse(payload.toString('utf8'));
  } catch {
    logger.warn(`MQTT: JSON inválido em ${topico}`);
    return null;
  }
  const resultado = schema.safeParse(json);
  if (!resultado.success) {
    logger.warn(`MQTT: mensagem inválida em ${topico}`, { problemas: resultado.error.issues.map((i) => i.message) });
    return null;
  }
  return resultado.data;
}

/** Trata cada mensagem recebida do broker. Mensagens inválidas são descartadas (com log). */
export async function tratarMensagemMqtt(topico: string, payload: Buffer, agora = new Date()) {
  switch (topico) {
    case TOPICOS.eventos: {
      const evento = lerJson(topico, payload, eventoMqttSchema);
      if (evento) await registrarEvento(evento, agora);
      return;
    }
    case TOPICOS.estado: {
      const estado = lerJson(topico, payload, estadoMqttSchema);
      if (estado) await receberEstado(estado, agora);
      return;
    }
    case TOPICOS.status: {
      const status = lerJson(topico, payload, statusMqttSchema);
      if (status && !status.online) await marcarOffline(agora);
      return;
    }
    case TOPICOS.resposta: {
      const resposta = lerJson(topico, payload, respostaMqttSchema);
      if (!resposta) return;
      const comando = await responderComando(resposta, agora);
      if (comando) await aoFinalizarComando(comando);
      return;
    }
    default:
      return;
  }
}
