import type {
  AcessosHora,
  Alerta,
  Comando,
  Configuracao,
  Estado,
  Leitura,
  PaginaEventos,
  Senha,
  SlotSenha,
  TipoComando,
} from '../types';

/** Por padrão o app chama /api na mesma origem (o Vite repassa para o backend). */
export const API_URL: string = import.meta.env.VITE_API_URL || '/api';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type Query = Record<string, string | number | undefined | null>;

async function requisicao<T>(metodo: string, caminho: string, opcoes: { body?: unknown; query?: Query } = {}) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(opcoes.query ?? {})) {
    if (v !== undefined && v !== null && v !== '') params.set(k, String(v));
  }
  const url = `${API_URL}${caminho}${params.toString() ? `?${params}` : ''}`;

  let resposta: Response;
  try {
    resposta = await fetch(url, {
      method: metodo,
      headers: {
        Accept: 'application/json',
        ...(opcoes.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: opcoes.body !== undefined ? JSON.stringify(opcoes.body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'Sem conexão com o servidor.');
  }

  const json = await resposta.json().catch(() => null);
  if (!resposta.ok) {
    const detalhe = json?.error?.details?.[0]?.message;
    throw new ApiError(resposta.status, detalhe ?? json?.error?.message ?? 'Erro inesperado.');
  }
  return json as { data: T; meta?: Record<string, unknown> };
}

const get = async <T>(caminho: string, query?: Query) => (await requisicao<T>('GET', caminho, { query })).data;

export const api = {
  estado: () => get<Estado>('/estado'),
  leituras: (minutos = 10) => get<Leitura[]>('/leituras', { minutos }),
  acessosPorHora: (data?: string) => get<AcessosHora[]>('/eventos/por-hora', { data }),

  async eventos(filtro: { tipo?: string; de?: string; ate?: string; page?: number; porPagina?: number }) {
    const res = await requisicao<PaginaEventos['itens']>('GET', '/eventos', { query: filtro });
    return { itens: res.data, ...(res.meta as Omit<PaginaEventos, 'itens'>) };
  },

  alertas: (status?: 'ATIVO' | 'RESOLVIDO') => get<Alerta[]>('/alertas', { status }),
  resolverAlerta: async (id: string) => (await requisicao<Alerta>('PATCH', `/alertas/${id}/resolver`)).data,

  senhas: () => get<SlotSenha[]>('/senhas'),
  salvarSenha: async (slot: number, nome: string, senha: string) =>
    (await requisicao<{ senha: Senha; comando: Comando }>('PUT', `/senhas/${slot}`, { body: { nome, senha } })).data,
  removerSenha: async (slot: number) => (await requisicao<{ comando: Comando }>('DELETE', `/senhas/${slot}`)).data,

  enviarComando: async (tipo: TipoComando) => (await requisicao<Comando>('POST', '/comandos', { body: { tipo } })).data,
  comando: (id: string) => get<Comando>(`/comandos/${id}`),

  configuracao: () => get<Configuracao>('/configuracao'),
  salvarConfiguracao: async (dados: Partial<Configuracao>) =>
    (await requisicao<{ configuracao: Configuracao; comando: Comando | null }>('PUT', '/configuracao', { body: dados })).data,
};
