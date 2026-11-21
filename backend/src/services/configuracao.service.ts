import { prisma } from '../config/prisma';
import { enviarComando } from './comando.service';
import { realtime } from './realtime.service';

export interface NovaConfiguracao {
  tempoAberturaMs?: number;
  limiteCm?: number;
  tempoMaxAbertaS?: number;
}

/** A configuração é uma linha única (id = 1). */
export function obterConfiguracao() {
  return prisma.configuracao.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });
}

/**
 * Salva os ajustes. Tempo de abertura e limite em cm vivem no Arduino, então também são
 * enviados com DEFINIR_CONFIG. O tempo máximo aberta é regra só do backend.
 */
export async function atualizarConfiguracao(dados: NovaConfiguracao) {
  const anterior = await obterConfiguracao();
  const configuracao = await prisma.configuracao.update({ where: { id: 1 }, data: dados });

  let comando = null;
  if (configuracao.tempoAberturaMs !== anterior.tempoAberturaMs || configuracao.limiteCm !== anterior.limiteCm) {
    comando = await enviarComando('DEFINIR_CONFIG', {
      tempoAberturaMs: configuracao.tempoAberturaMs,
      limiteCm: configuracao.limiteCm,
    });
  }
  realtime.publicar('configuracao', configuracao);
  return { configuracao, comando };
}

/**
 * Primeira execução: cria a configuração padrão e registra a senha que o firmware grava
 * sozinho no primeiro boot (slot 1, "Admin", 1234 — ver config.h do firmware).
 */
export async function garantirDadosIniciais() {
  const existe = await prisma.configuracao.findUnique({ where: { id: 1 } });
  if (existe) return;
  await prisma.configuracao.create({ data: { id: 1 } });
  await prisma.senha.upsert({
    where: { slot: 1 },
    create: { slot: 1, nome: 'Admin', senha: '1234', sincronizacao: 'APLICADA', motivo: 'Senha padrão do firmware' },
    update: {},
  });
}
