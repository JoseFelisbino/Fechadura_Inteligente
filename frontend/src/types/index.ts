export type EstadoPorta = 'ABERTA' | 'FECHADA' | 'DESCONHECIDA';
export type EstadoTrava = 'ABERTA' | 'FECHADA';

export type TipoEvento =
  | 'ACESSO_LIBERADO'
  | 'SENHA_INCORRETA'
  | 'BLOQUEIO_INICIO'
  | 'BLOQUEIO_FIM'
  | 'PORTA_ABERTA'
  | 'PORTA_FECHADA'
  | 'PORTA_NAO_FECHOU'
  | 'PORTA_FORCADA'
  | 'ALARME_DESLIGADO'
  | 'SENHA_ALTERADA';

export type Origem = 'TECLADO' | 'TECLADO_SAIDA' | 'BOTAO_SAIDA' | 'APP' | 'SENSOR' | 'SISTEMA';

export interface Evento {
  id: string;
  idExterno: string;
  tipo: TipoEvento;
  origem: Origem;
  usuario: string | null;
  ocorridoEm: string;
  recebidoEm: string;
}

export interface Estado {
  online: boolean;
  ultimaComunicacao: string | null;
  trava: EstadoTrava;
  porta: EstadoPorta;
  distanciaCm: number | null;
  bloqueado: boolean;
  alarme: boolean;
  portaDesde: string | null;
  ultimoAcesso: Evento | null;
  alertasAtivos: number;
}

export interface Leitura {
  id: number;
  distanciaCm: number | null;
  porta: EstadoPorta;
  trava: EstadoTrava;
  criadoEm: string;
}

export interface AcessosHora {
  hora: number;
  liberados: number;
  negados: number;
}

export type TipoAlerta = 'PORTA_FORCADA' | 'PORTA_NAO_FECHOU' | 'ABERTA_DEMAIS' | 'OFFLINE' | 'SENHAS_INCORRETAS';

export interface Alerta {
  id: string;
  tipo: TipoAlerta;
  status: 'ATIVO' | 'RESOLVIDO';
  mensagem: string;
  criadoEm: string;
  resolvidoEm: string | null;
}

export type Sincronizacao = 'PENDENTE' | 'APLICADA' | 'FALHOU' | 'REMOVENDO';

export interface Senha {
  slot: number;
  nome: string;
  senha: string;
  sincronizacao: Sincronizacao;
  motivo: string | null;
  atualizadoEm: string;
}

export type SlotSenha = Senha | { slot: number; vazio: true };

export type TipoComando = 'ABRIR_PORTA' | 'FECHAR_PORTA' | 'DESLIGAR_ALARME' | 'TESTAR_BUZZER' | 'ENVIAR_ESTADO';

export interface Comando {
  id: string;
  tipo: string;
  status: 'PENDENTE' | 'OK' | 'FALHOU' | 'EXPIRADO';
  motivo: string | null;
  criadoEm: string;
  respondidoEm: string | null;
}

export interface Configuracao {
  tempoAberturaMs: number;
  limiteCm: number;
  tempoMaxAbertaS: number;
  atualizadoEm: string;
}

export interface PaginaEventos {
  itens: Evento[];
  total: number;
  page: number;
  porPagina: number;
}
