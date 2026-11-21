import { env } from '../config/env';
import { logger } from '../utils/logger';
import { expirarComandos } from './comando.service';
import { obterConfiguracao } from './configuracao.service';
import { limparLeiturasAntigas, verificarEstado } from './estado.service';
import { aoFinalizarComando } from './senha.service';

const LIMPEZA_A_CADA_MS = 10 * 60 * 1000;
let ultimaLimpeza = 0;
let timer: NodeJS.Timeout | null = null;
let rodando = false;

/**
 * Uma rodada do monitor: dispositivo offline, porta aberta demais, comandos sem resposta e
 * limpeza das leituras antigas. Os testes chamam esta função direto, com o horário que quiserem.
 */
export async function rodarMonitor(agora = new Date()) {
  const config = await obterConfiguracao();
  await verificarEstado(agora, env.OFFLINE_APOS_SEGUNDOS * 1000, config.tempoMaxAbertaS * 1000);

  const expirados = await expirarComandos(agora, env.COMANDO_EXPIRA_SEGUNDOS * 1000);
  for (const comando of expirados) await aoFinalizarComando(comando);

  if (agora.getTime() - ultimaLimpeza >= LIMPEZA_A_CADA_MS) {
    ultimaLimpeza = agora.getTime();
    await limparLeiturasAntigas(agora);
  }
}

export function iniciarMonitor() {
  timer = setInterval(() => {
    if (rodando) return;
    rodando = true;
    rodarMonitor()
      .catch((err) => logger.error('Falha no monitor', { message: (err as Error).message }))
      .finally(() => {
        rodando = false;
      });
  }, env.MONITOR_INTERVALO_MS);
}

export function pararMonitor() {
  if (timer) clearInterval(timer);
  timer = null;
}
