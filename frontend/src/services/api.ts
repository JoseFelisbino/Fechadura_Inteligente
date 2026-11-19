export const API_URL: string = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api';

export interface ApiErrorDetail {
  field: string | null;
  message: string;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details: ApiErrorDetail[] = [],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type Query = Record<string, string | number | undefined | null>;

function buildUrl(path: string, query?: Query) {
  const url = new URL(`${API_URL}${path}`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}

/** Listener chamado quando a API responde 401 (sessão expirada). */
let unauthorizedHandler: (() => void) | null = null;
export function onUnauthorized(handler: (() => void) | null) {
  unauthorizedHandler = handler;
}

async function request<T>(method: string, path: string, options: { body?: unknown; query?: Query } = {}) {
  let response: Response;
  try {
    response = await fetch(buildUrl(path, options.query), {
      method,
      credentials: 'include', // envia o cookie HttpOnly da sessão
      headers: {
        Accept: 'application/json',
        // Cabeçalho exigido pelo backend como proteção CSRF.
        'X-Requested-With': 'XMLHttpRequest',
        ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'Não foi possível conectar ao servidor.');
  }

  const json = await response.json().catch(() => null);
  if (!response.ok) {
    const err = json?.error;
    if (response.status === 401 && !path.startsWith('/auth/')) unauthorizedHandler?.();
    throw new ApiError(
      response.status,
      err?.code ?? 'UNKNOWN_ERROR',
      err?.message ?? 'Erro inesperado.',
      Array.isArray(err?.details) ? err.details : [],
    );
  }
  return json as { data: T; meta?: unknown };
}

export const api = {
  async get<T>(path: string, query?: Query): Promise<T> {
    return (await request<T>('GET', path, { query })).data;
  },
  async getPage<T>(path: string, query?: Query) {
    const res = await request<T[]>('GET', path, { query });
    return { items: res.data, meta: res.meta as { page: number; pageSize: number; total: number } };
  },
  async post<T>(path: string, body: unknown = {}): Promise<T> {
    return (await request<T>('POST', path, { body })).data;
  },
  async patch<T>(path: string, body: unknown = {}): Promise<T> {
    return (await request<T>('PATCH', path, { body })).data;
  },
};
