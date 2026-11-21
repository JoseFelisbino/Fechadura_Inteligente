import { Prisma, type Origem, type TipoEvento } from '@prisma/client';
import { prisma } from '../config/prisma';
import { abrirAlerta, resolverAlertasDoTipo } from './alerta.service';
import { realtime } from './realtime.service';

export interface EventoRecebido {
  id: string;
  tipo: TipoEvento;
  origem: Origem;
  usuario?: string | null;
  timestamp?: number | string;
}

const INICIO_2025 = Date.UTC(2025, 0, 1);
const TOLERANCIA_FUTURO_MS = 60_000;
// Brasília não tem horário de verão desde 2019: UTC-3 o ano todo.
const FUSO_BRASILIA_MS = -3 * 60 * 60 * 1000;

/**
 * Converte o timestamp do Arduino. Aceita milissegundos, segundos ou texto ISO.
 * Sem horário, ou com um horário impossível, usa o horário de recebimento.
 */
export function resolverHorario(timestamp: number | string | undefined, recebidoEm: Date): Date {
  if (timestamp === undefined || timestamp === '') return recebidoEm;
  let ms: number;
  if (typeof timestamp === 'number') ms = timestamp < 1e12 ? timestamp * 1000 : timestamp;
  else ms = Date.parse(timestamp);
  if (!Number.isFinite(ms) || ms < INICIO_2025 || ms > recebidoEm.getTime() + TOLERANCIA_FUTURO_MS) return recebidoEm;
  return new Date(ms);
}

/** Salva um evento do Arduino. Retorna null se o mesmo id já foi recebido (reenvio). */
export async function registrarEvento(dados: EventoRecebido, agora = new Date()) {
  if (await prisma.evento.findUnique({ where: { idExterno: dados.id }, select: { id: true } })) return null;
  let evento;
  try {
    evento = await prisma.evento.create({
      data: {
        idExterno: dados.id,
        tipo: dados.tipo,
        origem: dados.origem,
        usuario: dados.usuario || null,
        ocorridoEm: resolverHorario(dados.timestamp, agora),
        recebidoEm: agora,
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return null;
    throw err;
  }

  // Eventos que abrem ou resolvem alertas
  if (evento.tipo === 'PORTA_FORCADA') await abrirAlerta('PORTA_FORCADA', agora);
  if (evento.tipo === 'PORTA_NAO_FECHOU') await abrirAlerta('PORTA_NAO_FECHOU', agora);
  if (evento.tipo === 'ALARME_DESLIGADO') await resolverAlertasDoTipo(['PORTA_FORCADA'], agora);
  if (evento.tipo === 'PORTA_FECHADA') await resolverAlertasDoTipo(['PORTA_NAO_FECHOU', 'ABERTA_DEMAIS'], agora);

  realtime.publicar('evento', evento);
  return evento;
}

export interface FiltroEventos {
  de?: Date;
  ate?: Date;
  tipos?: TipoEvento[];
  page: number;
  porPagina: number;
}

export async function listarEventos(filtro: FiltroEventos) {
  const where: Prisma.EventoWhereInput = {
    ocorridoEm: filtro.de || filtro.ate ? { gte: filtro.de, lte: filtro.ate } : undefined,
    tipo: filtro.tipos?.length ? { in: filtro.tipos } : undefined,
  };
  const [itens, total] = await Promise.all([
    prisma.evento.findMany({
      where,
      orderBy: { ocorridoEm: 'desc' },
      skip: (filtro.page - 1) * filtro.porPagina,
      take: filtro.porPagina,
    }),
    prisma.evento.count({ where }),
  ]);
  return { itens, total, page: filtro.page, porPagina: filtro.porPagina };
}

export function ultimoAcesso() {
  return prisma.evento.findFirst({ where: { tipo: 'ACESSO_LIBERADO' }, orderBy: { ocorridoEm: 'desc' } });
}

/** Data de hoje em Brasília no formato AAAA-MM-DD. */
export function hojeEmBrasilia(agora = new Date()) {
  return new Date(agora.getTime() + FUSO_BRASILIA_MS).toISOString().slice(0, 10);
}

/** Acessos liberados x senhas incorretas em cada hora do dia (horário de Brasília). */
export async function acessosPorHora(data: string) {
  const inicio = new Date(`${data}T00:00:00.000-03:00`);
  const fim = new Date(inicio.getTime() + 24 * 60 * 60 * 1000);
  const eventos = await prisma.evento.findMany({
    where: { tipo: { in: ['ACESSO_LIBERADO', 'SENHA_INCORRETA'] }, ocorridoEm: { gte: inicio, lt: fim } },
    select: { tipo: true, ocorridoEm: true },
  });
  const horas = Array.from({ length: 24 }, (_, hora) => ({ hora, liberados: 0, negados: 0 }));
  for (const e of eventos) {
    const hora = Math.floor((e.ocorridoEm.getTime() - inicio.getTime()) / 3_600_000);
    if (e.tipo === 'ACESSO_LIBERADO') horas[hora].liberados++;
    else horas[hora].negados++;
  }
  return horas;
}
