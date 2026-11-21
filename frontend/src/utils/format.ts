import type { Evento, Origem, TipoAlerta, TipoEvento } from '../types';

const dataHora = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});
const hora = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });

export function formatarDataHora(iso: string | null | undefined) {
  return iso ? dataHora.format(new Date(iso)) : '—';
}

export function formatarHora(iso: string | number) {
  return hora.format(new Date(iso));
}

/** "agora", "há 12 s", "há 3 min", "há 2 h", "há 4 dias". */
export function haQuanto(iso: string | null | undefined, agora = Date.now()) {
  if (!iso) return '—';
  const s = Math.max(0, Math.round((agora - new Date(iso).getTime()) / 1000));
  if (s < 5) return 'agora';
  if (s < 60) return `há ${s} s`;
  const min = Math.floor(s / 60);
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  return `há ${d} ${d === 1 ? 'dia' : 'dias'}`;
}

/** Duração curta: "45 s", "3 min 10 s", "1 h 05 min". */
export function duracao(desdeIso: string | null, agora = Date.now()) {
  if (!desdeIso) return '';
  const s = Math.max(0, Math.floor((agora - new Date(desdeIso).getTime()) / 1000));
  if (s < 60) return `${s} s`;
  const min = Math.floor(s / 60);
  if (min < 60) return `${min} min ${String(s % 60).padStart(2, '0')} s`;
  return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min`;
}

export const ROTULO_ORIGEM: Record<Origem, string> = {
  TECLADO: 'Entrada · teclado',
  TECLADO_SAIDA: 'Saída · teclado',
  BOTAO_SAIDA: 'Saída · botão',
  APP: 'App',
  SENSOR: 'Sensor',
  SISTEMA: 'Sistema',
};

const TITULO_EVENTO: Record<TipoEvento, string> = {
  ACESSO_LIBERADO: 'Acesso liberado',
  SENHA_INCORRETA: 'Senha incorreta',
  BLOQUEIO_INICIO: 'Teclado bloqueado (3 erros)',
  BLOQUEIO_FIM: 'Fim do bloqueio',
  PORTA_ABERTA: 'Porta aberta',
  PORTA_FECHADA: 'Porta fechada',
  PORTA_NAO_FECHOU: 'Porta não fechou',
  PORTA_FORCADA: 'Porta forçada — alarme',
  ALARME_DESLIGADO: 'Alarme desligado',
  SENHA_ALTERADA: 'Senha alterada',
};

/** Título do evento, deixando entrada, saída e app bem claros. */
export function tituloEvento(e: Pick<Evento, 'tipo' | 'origem'>) {
  if (e.tipo === 'ACESSO_LIBERADO') {
    if (e.origem === 'TECLADO') return 'Entrada liberada';
    if (e.origem === 'TECLADO_SAIDA' || e.origem === 'BOTAO_SAIDA') return 'Saída liberada';
    if (e.origem === 'APP') return 'Aberta pelo app';
  }
  return TITULO_EVENTO[e.tipo];
}

export type Tom = 'ok' | 'info' | 'aviso' | 'perigo' | 'neutro';

export function tomEvento(tipo: TipoEvento): Tom {
  switch (tipo) {
    case 'ACESSO_LIBERADO':
    case 'ALARME_DESLIGADO':
    case 'BLOQUEIO_FIM':
      return 'ok';
    case 'PORTA_FORCADA':
    case 'BLOQUEIO_INICIO':
      return 'perigo';
    case 'SENHA_INCORRETA':
    case 'PORTA_NAO_FECHOU':
      return 'aviso';
    case 'SENHA_ALTERADA':
      return 'info';
    default:
      return 'neutro';
  }
}

export const TITULO_ALERTA: Record<TipoAlerta, string> = {
  PORTA_FORCADA: 'Porta forçada',
  PORTA_NAO_FECHOU: 'Porta não fechou',
  ABERTA_DEMAIS: 'Aberta tempo demais',
  OFFLINE: 'Fechadura offline',
};

const MOTIVOS: Record<string, string> = {
  DISPOSITIVO_OFFLINE: 'a fechadura está sem comunicação',
  BROKER_DESCONECTADO: 'o servidor está sem conexão com o broker',
  SEM_RESPOSTA: 'a fechadura não respondeu',
  SENHA_DUPLICADA: 'essa senha já existe na fechadura',
  SENHA_INVALIDA: 'senha inválida',
  SLOT_INVALIDO: 'slot inválido',
  NOME_INVALIDO: 'nome inválido',
  TEMPO_INVALIDO: 'tempo fora do permitido',
  LIMITE_INVALIDO: 'limite fora do permitido',
  COMANDO_DESCONHECIDO: 'comando desconhecido',
};

export function traduzirMotivo(motivo: string | null | undefined): string {
  if (!motivo) return 'falhou';
  if (motivo.startsWith('Remoção não confirmada: ')) {
    return `remoção não confirmada (${traduzirMotivo(motivo.slice('Remoção não confirmada: '.length))})`;
  }
  return MOTIVOS[motivo] ?? motivo;
}
