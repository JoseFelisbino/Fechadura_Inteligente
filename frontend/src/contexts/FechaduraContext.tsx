import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { API_URL, api } from '../services/api';
import type { Alerta, Estado, Evento } from '../types';
import { notificar, notificarAlerta } from '../utils/notificacoes';

/**
 * Estado compartilhado do app:
 *  - estado atual da fechadura (cartão da porta, botões);
 *  - tempo real por SSE (/api/stream); se o SSE cair, recarrega a cada 5 s;
 *  - "versões" que as telas usam para recarregar listas quando algo muda;
 *  - amostras de distância ao vivo para o gráfico;
 *  - notificação do navegador quando chega um alerta novo (se ativada em Ajustes);
 *  - aviso na tela (e notificação) a cada senha incorreta digitada no teclado.
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

/** Aviso de senha incorreta mostrado no topo do app, em qualquer tela. */
export interface AvisoSenha {
  tentativas: number; // quantas senhas erradas seguidas enquanto o aviso estava na tela
  ultimaEm: string;
  saida: boolean; // errou no modo saída (D + senha + #)
}

interface ValorContexto {
  estado: Estado | null;
  conexao: Conexao;
  semRede: boolean; // o app não alcança o servidor: mostra a última leitura e desabilita os botões
  versoes: Versoes;
  amostras: Amostra[];
  recarregar: () => Promise<void>;
  avisoSenha: AvisoSenha | null;
  fecharAvisoSenha: () => void;
}

const Contexto = createContext<ValorContexto | null>(null);

const CHAVE_CACHE = 'fechadura:ultimo-estado';
const POLLING_MS = 5000;
const JANELA_AMOSTRAS_MS = 10 * 60 * 1000;
const AVISO_SENHA_MS = 10_000; // o aviso some sozinho depois de 10 s sem novo erro
const EVENTO_RECENTE_MS = 60_000; // eventos antigos (fila reenviada ao reconectar) não viram aviso

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
  const [avisoSenha, setAvisoSenha] = useState<AvisoSenha | null>(null);
  const fecharAvisoSenha = useCallback(() => setAvisoSenha(null), []);

  const avisarSenhaIncorreta = useCallback((evento: Evento) => {
    if (Date.now() - new Date(evento.ocorridoEm).getTime() > EVENTO_RECENTE_MS) return;
    const saida = evento.origem === 'TECLADO_SAIDA';
    setAvisoSenha((anterior) => ({ tentativas: (anterior?.tentativas ?? 0) + 1, ultimaEm: evento.ocorridoEm, saida }));
    void notificar('Fechadura: senha incorreta', `Alguém digitou uma senha errada ${saida ? 'na saída' : 'no teclado'}.`, 'senha-incorreta');
  }, []);

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
      if (evento.tipo === 'SENHA_INCORRETA') avisarSenhaIncorreta(evento);
      marcar('eventos');
    });
    fonte.addEventListener('alerta', (e) => {
      notificarAlerta(ler(e as MessageEvent) as Alerta);
      marcar('alertas');
      void recarregar(); // atualiza o contador de alertas ativos
    });
    fonte.addEventListener('senha', () => marcar('senhas'));
    fonte.addEventListener('configuracao', () => marcar('configuracao'));
    fonte.onerror = () => setConexao('recarregando');

    return () => fonte.close();
  }, [atualizarEstado, avisarSenhaIncorreta, marcar, recarregar]);

  // Esconde o aviso de senha incorreta depois de um tempo (reinicia a cada novo erro).
  useEffect(() => {
    if (!avisoSenha) return;
    const timer = setTimeout(() => setAvisoSenha(null), AVISO_SENHA_MS);
    return () => clearTimeout(timer);
  }, [avisoSenha]);

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
    () => ({ estado, conexao, semRede, versoes, amostras, recarregar, avisoSenha, fecharAvisoSenha }),
    [estado, conexao, semRede, versoes, amostras, recarregar, avisoSenha, fecharAvisoSenha],
  );
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useFechadura() {
  const valor = useContext(Contexto);
  if (!valor) throw new Error('useFechadura precisa estar dentro de <FechaduraProvider>.');
  return valor;
}
