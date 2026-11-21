import type { Comando, Prisma, TipoComando } from '@prisma/client';
import { prisma } from '../config/prisma';
import { TOPICOS } from '../mqtt/topicos';
import { transporte } from '../mqtt/transporte';
import { HttpError } from '../utils/http-error';
import { obterEstado } from './estado.service';
import { realtime } from './realtime.service';

export interface RespostaComando {
  id: string;
  ok: boolean;
  motivo?: string;
}

async function falhar(id: string, motivo: string) {
  const comando = await prisma.comando.update({
    where: { id },
    data: { status: 'FALHOU', motivo, respondidoEm: new Date() },
  });
  realtime.publicar('comando', comando);
  return comando;
}

/**
 * Cria o comando no banco e publica em fechadura/comandos. O resultado chega depois, em
 * fechadura/comandos/resposta (ou o comando expira após COMANDO_EXPIRA_SEGUNDOS).
 * `paramsParaSalvar` permite guardar os parâmetros sem a senha.
 */
export async function enviarComando(
  tipo: TipoComando,
  params?: Record<string, unknown>,
  paramsParaSalvar: Record<string, unknown> | undefined = params,
): Promise<Comando> {
  const comando = await prisma.comando.create({
    data: { tipo, params: (paramsParaSalvar ?? undefined) as Prisma.InputJsonValue | undefined },
  });

  if (!obterEstado().online) return falhar(comando.id, 'DISPOSITIVO_OFFLINE');

  const mensagem = JSON.stringify(params ? { id: comando.id, tipo, params } : { id: comando.id, tipo });
  if (!transporte.publicar(TOPICOS.comandos, mensagem)) return falhar(comando.id, 'BROKER_DESCONECTADO');

  realtime.publicar('comando', comando);
  return comando;
}

/** Resposta do Arduino. Ignora respostas de comandos que já terminaram (ex.: expirados). */
export async function responderComando(resposta: RespostaComando, agora = new Date()) {
  const atual = await prisma.comando.findUnique({ where: { id: resposta.id } });
  if (!atual || atual.status !== 'PENDENTE') return null;
  const comando = await prisma.comando.update({
    where: { id: resposta.id },
    data: {
      status: resposta.ok ? 'OK' : 'FALHOU',
      motivo: resposta.ok ? null : resposta.motivo || 'RECUSADO',
      respondidoEm: agora,
    },
  });
  realtime.publicar('comando', comando);
  return comando;
}

/** Marca como EXPIRADO o que ficou sem resposta. Retorna os comandos expirados. */
export async function expirarComandos(agora: Date, expiraAposMs: number) {
  const vencidos = await prisma.comando.findMany({
    where: { status: 'PENDENTE', criadoEm: { lt: new Date(agora.getTime() - expiraAposMs) } },
  });
  const expirados: Comando[] = [];
  for (const c of vencidos) {
    const comando = await prisma.comando.update({
      where: { id: c.id },
      data: { status: 'EXPIRADO', motivo: 'SEM_RESPOSTA', respondidoEm: agora },
    });
    realtime.publicar('comando', comando);
    expirados.push(comando);
  }
  return expirados;
}

export async function obterComando(id: string) {
  const comando = await prisma.comando.findUnique({ where: { id } });
  if (!comando) throw HttpError.notFound('Comando não encontrado.');
  return comando;
}
