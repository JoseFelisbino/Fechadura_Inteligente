import { Prisma, type StatusAlerta, type TipoAlerta } from '@prisma/client';
import { prisma } from '../config/prisma';
import { HttpError } from '../utils/http-error';
import { realtime } from './realtime.service';

export const MENSAGENS_ALERTA: Record<TipoAlerta, string> = {
  PORTA_FORCADA: 'A porta foi aberta sem liberação. Alarme disparado.',
  PORTA_NAO_FECHOU: 'A porta não fechou depois de ser liberada.',
  ABERTA_DEMAIS: 'A porta está aberta há mais tempo que o permitido.',
  OFFLINE: 'A fechadura está sem comunicação.',
};

/**
 * Abre um alerta, se ainda não houver um ATIVO do mesmo tipo (um por ocorrência).
 * O índice único parcial da migration garante isso mesmo com duas chamadas simultâneas.
 */
export async function abrirAlerta(tipo: TipoAlerta, agora = new Date()) {
  const ativo = await prisma.alerta.findFirst({ where: { tipo, status: 'ATIVO' } });
  if (ativo) return null;
  try {
    const alerta = await prisma.alerta.create({ data: { tipo, mensagem: MENSAGENS_ALERTA[tipo], criadoEm: agora } });
    realtime.publicar('alerta', alerta);
    return alerta;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return null;
    throw err;
  }
}

/** Resolve automaticamente os alertas ativos dos tipos informados. */
export async function resolverAlertasDoTipo(tipos: TipoAlerta[], agora = new Date()) {
  const ativos = await prisma.alerta.findMany({ where: { tipo: { in: tipos }, status: 'ATIVO' } });
  for (const alerta of ativos) {
    const resolvido = await prisma.alerta.update({
      where: { id: alerta.id },
      data: { status: 'RESOLVIDO', resolvidoEm: agora },
    });
    realtime.publicar('alerta', resolvido);
  }
  return ativos.length;
}

/** Resolução manual pelo app. */
export async function resolverAlerta(id: string) {
  const alerta = await prisma.alerta.findUnique({ where: { id } });
  if (!alerta) throw HttpError.notFound('Alerta não encontrado.');
  if (alerta.status === 'RESOLVIDO') return alerta;
  const resolvido = await prisma.alerta.update({
    where: { id },
    data: { status: 'RESOLVIDO', resolvidoEm: new Date() },
  });
  realtime.publicar('alerta', resolvido);
  return resolvido;
}

export function listarAlertas(status?: StatusAlerta) {
  return prisma.alerta.findMany({
    where: status ? { status } : undefined,
    orderBy: { criadoEm: 'desc' },
    take: 100,
  });
}

export function contarAlertasAtivos() {
  return prisma.alerta.count({ where: { status: 'ATIVO' } });
}
