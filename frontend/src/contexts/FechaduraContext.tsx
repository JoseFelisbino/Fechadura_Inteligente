import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { API_URL, api } from '../services/api';
import type { Estado, Evento } from '../types';

/**
 * Estado compartilhado do app:
 *  - estado atual da fechadura (cartão da porta, botões);
 *  - tempo real por SSE (/api/stream); se o SSE cair, recarrega a cada 5 s;
 *  - "versões" que as telas usam para recarregar listas quando algo muda;
 *  - amostras de distância ao vivo para o gráfico.
 */

export type Conexao = 'conectando' | 'tempo-real' | 'recarregando';

export interface Versoes {
  eventos: number;
  alertas: number;
  senhas: number;
  configuracao: number;
}

export interface Amostra {
  t: number;
  cm: number | null;
}

interface ValorContexto {
  estado: Estado | null;
  conexao: Conexao;
  semRede: boolean; // o app não alcança o servidor: mostra a última leitura e desabilita os botões
  versoes: Versoes;
  amostras: Amostra[];
  recarregar: () => Promise<void>;
}

const Contexto = createContext<ValorContexto | null>(null);

const CHAVE_CACHE = 'fechadura:ultimo-estado';
const POLLING_MS = 5000;
const JANELA_AMOSTRAS_MS = 10 * 60 * 1000;

function lerCache(): Estado | null {
  try {
    const texto = localStorage.getItem(CHAVE_CACHE);
    return texto ? (JSON.parse(texto) as Estado) : null;
  } catch {
    return null;
  }
}

function salvarCache(estado: Estado) {
  try {
    localStorage.setItem(CHAVE_CACHE, JSON.stringify(estado));
  } catch {
    // modo privado ou armazenamento cheio: segue sem cache
  }
}

export function FechaduraProvider({ children }: { children: ReactNode }) {
  const [estado, setEstado] = useState<Estado | null>(lerCache);
  const [conexao, setConexao] = useState<Conexao>('conectando');
  const [semRede, setSemRede] = useState(typeof navigator !== 'undefined' && navigator.onLine === false);
  const [versoes, setVersoes] = useState<Versoes>({ eventos: 0, alertas: 0, senhas: 0, configuracao: 0 });
  const [amostras, setAmostras] = useState<Amostra[]>([]);
  const ultimaAmostra = useRef<string | null>(null);

  const atualizarEstado = useCallback((parcial: Partial<Estado>) => {
    setEstado((anterior) => {
      const novo = { ...(anterior ?? ({} as Estado)), ...parcial } as Estado;
      salvarCache(novo);
      return novo;
    });
    if ('distanciaCm' in parcial && parcial.ultimaComunicacao && parcial.ultimaComunicacao !== ultimaAmostra.current) {
      ultimaAmostra.current = parcial.ultimaComunicacao;
      const t = new Date(parcial.ultimaComunicacao).getTime();
      setAmostras((lista) =>
        [...lista, { t, cm: parcial.distanciaCm ?? null }].filter((a) => a.t >= Date.now() - JANELA_AMOSTRAS_MS),
      );
    }
  }, []);

  const recarregar = useCallback(async () => {
    try {
      atualizarEstado(await api.estado());
      setSemRede(false);
    } catch {
      setSemRede(true);
    }
  }, [atualizarEstado]);

  const marcar = useCallback((...chaves: (keyof Versoes)[]) => {
    setVersoes((v) => {
      const novo = { ...v };
      for (const c of chaves) novo[c] += 1;
      return novo;
    });
  }, []);

  // Tempo real (SSE). O navegador reconecta sozinho; enquanto isso, recarregamos a cada 5 s.
  useEffect(() => {
    void recarregar();
    const fonte = new EventSource(`${API_URL}/stream`);
    const ler = (e: MessageEvent) => JSON.parse(e.data as string);

    fonte.addEventListener('pronto', () => {
      setConexao('tempo-real');
      setSemRede(false);
      void recarregar();
      marcar('eventos', 'alertas', 'senhas', 'configuracao'); // pode ter perdido algo enquanto estava fora
    });
    fonte.addEventListener('estado', (e) => atualizarEstado(ler(e as MessageEvent)));
    fonte.addEventListener('evento', (e) => {
      const evento = ler(e as MessageEvent) as Evento;
      if (evento.tipo === 'ACESSO_LIBERADO') atualizarEstado({ ultimoAcesso: evento });
      marcar('eventos');
    });
    fonte.addEventListener('alerta', () => {
      marcar('alertas');
      void recarregar(); // atualiza o contador de alertas ativos
    });
    fonte.addEventListener('senha', () => marcar('senhas'));
    fonte.addEventListener('configuracao', () => marcar('configuracao'));
    fonte.onerror = () => setConexao('recarregando');

    return () => fonte.close();
  }, [atualizarEstado, marcar, recarregar]);

  useEffect(() => {
    if (conexao === 'tempo-real') return;
    const timer = setInterval(() => {
      void recarregar();
      marcar('eventos', 'alertas', 'senhas', 'configuracao');
    }, POLLING_MS);
    return () => clearInterval(timer);
  }, [conexao, marcar, recarregar]);

  useEffect(() => {
    const offline = () => setSemRede(true);
    const online = () => void recarregar();
    window.addEventListener('offline', offline);
    window.addEventListener('online', online);
    return () => {
      window.removeEventListener('offline', offline);
      window.removeEventListener('online', online);
    };
  }, [recarregar]);

  const valor = useMemo(
    () => ({ estado, conexao, semRede, versoes, amostras, recarregar }),
    [estado, conexao, semRede, versoes, amostras, recarregar],
  );
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useFechadura() {
  const valor = useContext(Contexto);
  if (!valor) throw new Error('useFechadura precisa estar dentro de <FechaduraProvider>.');
  return valor;
}
