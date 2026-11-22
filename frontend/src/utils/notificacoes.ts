import type { Alerta } from '../types';
import { TITULO_ALERTA } from './format';

/**
 * Notificações do navegador (só com o app aberto: quem avisa é o SSE).
 *  - O navegador só deixa notificar em HTTPS ou em localhost.
 *  - O usuário liga em Ajustes; a escolha fica guardada neste aparelho (localStorage).
 *  - No Android o Chrome não aceita `new Notification()`: lá usamos o service worker do PWA.
 */

export type SituacaoNotificacao = 'sem-suporte' | 'bloqueada' | 'ativada' | 'desativada';

const CHAVE = 'fechadura:notificacoes';

export function suportaNotificacao() {
  return typeof window !== 'undefined' && 'Notification' in window && window.isSecureContext !== false;
}

function lerPreferencia() {
  try {
    return localStorage.getItem(CHAVE) === 'sim';
  } catch {
    return false;
  }
}

function salvarPreferencia(ligada: boolean) {
  try {
    localStorage.setItem(CHAVE, ligada ? 'sim' : 'nao');
  } catch {
    // modo privado: vale só enquanto a página estiver aberta
  }
}

export function situacaoNotificacao(): SituacaoNotificacao {
  if (!suportaNotificacao()) return 'sem-suporte';
  if (Notification.permission === 'denied') return 'bloqueada';
  return Notification.permission === 'granted' && lerPreferencia() ? 'ativada' : 'desativada';
}

/** Pede permissão ao navegador (precisa ser num clique) e liga as notificações. */
export async function ativarNotificacoes(): Promise<SituacaoNotificacao> {
  if (!suportaNotificacao()) return 'sem-suporte';
  const permissao = await Notification.requestPermission();
  salvarPreferencia(permissao === 'granted');
  return situacaoNotificacao();
}

export function desativarNotificacoes() {
  salvarPreferencia(false);
}

/** Mostra uma notificação, se estiver ativada. */
export async function notificar(titulo: string, corpo: string, tag: string) {
  if (situacaoNotificacao() !== 'ativada') return;
  const opcoes: NotificationOptions = { body: corpo, tag, icon: '/pwa-192x192.png' };
  try {
    const registro = await navigator.serviceWorker?.getRegistration();
    if (registro) return await registro.showNotification(titulo, opcoes);
    new Notification(titulo, opcoes);
  } catch {
    // o navegador recusou: o alerta continua aparecendo na tela Alertas
  }
}

/** Avisa um alerta novo. Alertas resolvidos não notificam. */
export function notificarAlerta(alerta: Alerta) {
  if (alerta.status !== 'ATIVO') return;
  void notificar(`Fechadura: ${TITULO_ALERTA[alerta.tipo]}`, alerta.mensagem, `alerta-${alerta.id}`);
}
