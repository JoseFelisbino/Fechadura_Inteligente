import { createApp } from '../src/app';
import { prisma } from '../src/config/prisma';
import { tratarMensagemMqtt } from '../src/mqtt/handlers';
import { TOPICOS } from '../src/mqtt/topicos';
import { transporte } from '../src/mqtt/transporte';
import { resetarEstado } from '../src/services/estado.service';

export const app = createApp();

/** Mensagens que o backend "publicou" no broker (o transporte real é trocado por este). */
export const publicados: { topico: string; mensagem: Record<string, unknown> }[] = [];
let brokerConectado = true;

export function simularBroker(conectado = true) {
  brokerConectado = conectado;
}

transporte.definir((topico, mensagem) => {
  if (!brokerConectado) return false;
  publicados.push({ topico, mensagem: JSON.parse(mensagem) });
  return true;
});

export async function limparTudo() {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "Evento", "Leitura", "Senha", "Comando", "Alerta", "Configuracao" RESTART IDENTITY CASCADE',
  );
  resetarEstado();
  publicados.length = 0;
  brokerConectado = true;
}

/** Simula uma mensagem do Arduino chegando pelo broker. */
export function doArduino(topico: string, dados: unknown, agora = new Date()) {
  const texto = typeof dados === 'string' ? dados : JSON.stringify(dados);
  return tratarMensagemMqtt(topico, Buffer.from(texto), agora);
}

export const ESTADO_FECHADA = { trava: 'FECHADA', porta: 'FECHADA', distanciaCm: 4, bloqueado: false, alarme: false };

/** O Arduino manda um estado (e com isso fica online). */
export function ficarOnline(agora = new Date(), estado: Record<string, unknown> = {}) {
  return doArduino(TOPICOS.estado, { ...ESTADO_FECHADA, ...estado, online: true }, agora);
}

let seq = 0;
export function novoId() {
  seq += 1;
  return `teste-${Date.now()}-${seq}`;
}

export function evento(tipo: string, extra: Record<string, unknown> = {}) {
  return { id: novoId(), tipo, origem: 'SENSOR', ...extra };
}

export const segundos = (s: number, base = new Date()) => new Date(base.getTime() + s * 1000);
