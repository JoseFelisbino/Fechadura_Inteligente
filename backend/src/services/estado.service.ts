import type { EstadoPorta, EstadoTrava } from '@prisma/client';
import { prisma } from '../config/prisma';
import { abrirAlerta, resolverAlertasDoTipo } from './alerta.service';
import { realtime } from './realtime.service';

/** Estado atual da fechadura, mantido em memória (o Arduino manda um novo a cada 2 s). */
export interface EstadoDispositivo {
  online: boolean;
  ultimaComunicacao: Date | null;
  trava: EstadoTrava;
  porta: EstadoPorta;
  distanciaCm: number | null;
  bloqueado: boolean;
  alarme: boolean;
  portaDesde: Date | null; // desde quando a porta está no estado atual
}

export interface EstadoRecebido {
  trava: EstadoTrava;
  porta: EstadoPorta;
  distanciaCm?: number | null;
  bloqueado: boolean;
  alarme: boolean;
}

const INTERVALO_LEITURA_MS = 5_000; // salva no máximo 1 leitura a cada 5 s
const RETENCAO_LEITURAS_MS = 24 * 60 * 60 * 1000;

function estadoInicial(): EstadoDispositivo {
  return {
    online: false,
    ultimaComunicacao: null,
    trava: 'FECHADA',
    porta: 'DESCONHECIDA',
    distanciaCm: null,
    bloqueado: false,
    alarme: false,
    portaDesde: null,
  };
}

let estado = estadoInicial();
let ultimaLeituraSalva = 0;
let inicio = Date.now();
let offlineAvisado = false;

export function obterEstado(): EstadoDispositivo {
  return { ...estado };
}

/** Somente para testes. */
export function resetarEstado(agora = new Date()) {
  estado = estadoInicial();
  ultimaLeituraSalva = 0;
  inicio = agora.getTime();
  offlineAvisado = false;
}

export async function receberEstado(dados: EstadoRecebido, agora = new Date()) {
  const mudouPorta = dados.porta !== estado.porta;
  estado = {
    online: true,
    ultimaComunicacao: agora,
    trava: dados.trava,
    porta: dados.porta,
    distanciaCm: dados.distanciaCm ?? null,
    bloqueado: dados.bloqueado,
    alarme: dados.alarme,
    portaDesde: mudouPorta || !estado.portaDesde ? agora : estado.portaDesde,
  };
  offlineAvisado = false;

  await resolverAlertasDoTipo(['OFFLINE'], agora);
  if (mudouPorta && dados.porta === 'FECHADA') await resolverAlertasDoTipo(['ABERTA_DEMAIS', 'PORTA_NAO_FECHOU'], agora);

  if (agora.getTime() - ultimaLeituraSalva >= INTERVALO_LEITURA_MS) {
    ultimaLeituraSalva = agora.getTime();
    await prisma.leitura.create({
      data: { distanciaCm: estado.distanciaCm, porta: estado.porta, trava: estado.trava, criadoEm: agora },
    });
  }

  realtime.publicar('estado', obterEstado());
}

/** Testamento (LWT) do broker ou falta de estado por OFFLINE_APOS_SEGUNDOS. */
export async function marcarOffline(agora = new Date()) {
  const eraOnline = estado.online;
  estado.online = false;
  if (eraOnline || !offlineAvisado) {
    offlineAvisado = true;
    await abrirAlerta('OFFLINE', agora);
    realtime.publicar('estado', obterEstado());
  }
}

/** Chamado pelo monitor: offline e porta aberta tempo demais. */
export async function verificarEstado(agora: Date, offlineAposMs: number, tempoMaxAbertaMs: number) {
  const ultima = estado.ultimaComunicacao?.getTime() ?? inicio;
  if (agora.getTime() - ultima > offlineAposMs && (estado.online || !offlineAvisado)) {
    await marcarOffline(agora);
  }

  if (
    estado.online &&
    estado.porta === 'ABERTA' &&
    estado.portaDesde &&
    agora.getTime() - estado.portaDesde.getTime() > tempoMaxAbertaMs
  ) {
    await abrirAlerta('ABERTA_DEMAIS', agora);
  }
}

export function listarLeituras(minutos: number, agora = new Date()) {
  return prisma.leitura.findMany({
    where: { criadoEm: { gte: new Date(agora.getTime() - minutos * 60_000) } },
    orderBy: { criadoEm: 'asc' },
  });
}

export async function limparLeiturasAntigas(agora = new Date()) {
  const { count } = await prisma.leitura.deleteMany({
    where: { criadoEm: { lt: new Date(agora.getTime() - RETENCAO_LEITURAS_MS) } },
  });
  return count;
}
