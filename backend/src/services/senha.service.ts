import type { Comando } from '@prisma/client';
import { prisma } from '../config/prisma';
import { HttpError } from '../utils/http-error';
import { enviarComando } from './comando.service';
import { realtime } from './realtime.service';

export const SLOTS = [1, 2, 3] as const;

/** Os 3 slots, com `null` nos vazios. */
export async function listarSenhas() {
  const senhas = await prisma.senha.findMany({ orderBy: { slot: 'asc' } });
  return SLOTS.map((slot) => senhas.find((s) => s.slot === slot) ?? { slot, vazio: true as const });
}

export async function obterSenha(slot: number) {
  const senha = await prisma.senha.findUnique({ where: { slot } });
  if (!senha) throw HttpError.notFound('Slot vazio.');
  return senha;
}

async function aplicarResultadoImediato(slot: number, comando: Comando) {
  if (comando.status !== 'FALHOU') return;
  await prisma.senha.update({ where: { slot }, data: { sincronizacao: 'FALHOU', motivo: comando.motivo } });
}

/** Cria/edita a senha e envia DEFINIR_SENHA ao Arduino. */
export async function definirSenha(slot: number, nome: string, senha: string) {
  const duplicada = await prisma.senha.findFirst({ where: { senha, slot: { not: slot } } });
  if (duplicada) throw HttpError.conflict(`Essa senha já é usada no slot ${duplicada.slot}.`);

  await prisma.senha.upsert({
    where: { slot },
    create: { slot, nome, senha, sincronizacao: 'PENDENTE' },
    update: { nome, senha, sincronizacao: 'PENDENTE', motivo: null },
  });
  // Os parâmetros salvos no histórico de comandos não incluem a senha.
  const comando = await enviarComando('DEFINIR_SENHA', { slot, nome, senha }, { slot, nome });
  await prisma.senha.update({ where: { slot }, data: { comandoId: comando.id } });
  await aplicarResultadoImediato(slot, comando);

  const salva = await prisma.senha.findUniqueOrThrow({ where: { slot } });
  realtime.publicar('senha', { slot });
  return { senha: salva, comando };
}

/** Envia REMOVER_SENHA. O slot só é apagado do banco quando o Arduino confirma. */
export async function removerSenha(slot: number) {
  await obterSenha(slot);
  await prisma.senha.update({ where: { slot }, data: { sincronizacao: 'REMOVENDO', motivo: null } });
  const comando = await enviarComando('REMOVER_SENHA', { slot });
  await prisma.senha.update({ where: { slot }, data: { comandoId: comando.id } });
  await aplicarResultadoImediato(slot, comando);
  realtime.publicar('senha', { slot });
  return { comando };
}

/** Chamado quando um comando termina (resposta ou expiração). */
export async function aoFinalizarComando(comando: Comando) {
  if (comando.tipo !== 'DEFINIR_SENHA' && comando.tipo !== 'REMOVER_SENHA') return;
  const senha = await prisma.senha.findFirst({ where: { comandoId: comando.id } });
  if (!senha) return; // já foi editada de novo: vale o comando mais recente

  if (comando.status === 'OK' && comando.tipo === 'REMOVER_SENHA') {
    await prisma.senha.delete({ where: { slot: senha.slot } });
  } else if (comando.status === 'OK') {
    await prisma.senha.update({ where: { slot: senha.slot }, data: { sincronizacao: 'APLICADA', motivo: null } });
  } else {
    const motivo = comando.tipo === 'REMOVER_SENHA' ? `Remoção não confirmada: ${comando.motivo}` : comando.motivo;
    await prisma.senha.update({ where: { slot: senha.slot }, data: { sincronizacao: 'FALHOU', motivo } });
  }
  realtime.publicar('senha', { slot: senha.slot });
}
