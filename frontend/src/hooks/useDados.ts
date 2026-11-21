import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Carrega dados da API e recarrega quando alguma dependência muda (ex.: a "versão" que o
 * contexto incrementa quando chega um evento pelo SSE). Na recarga, mantém os dados antigos
 * na tela em vez de piscar o "carregando".
 */
export function useDados<T>(carregar: () => Promise<T>, deps: unknown[]) {
  const [dados, setDados] = useState<T | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const ultima = useRef(0);

  const executar = useCallback(carregar, deps);

  const recarregar = useCallback(async () => {
    const minha = ++ultima.current;
    try {
      const resultado = await executar();
      if (minha !== ultima.current) return;
      setDados(resultado);
      setErro(null);
    } catch (e) {
      if (minha === ultima.current) setErro((e as Error).message);
    } finally {
      if (minha === ultima.current) setCarregando(false);
    }
  }, [executar]);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  return { dados, erro, carregando, recarregar, setDados };
}

/** Relógio que atualiza a cada `intervaloMs` (para "há X s"). */
export function useAgora(intervaloMs = 1000) {
  const [agora, setAgora] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), intervaloMs);
    return () => clearInterval(t);
  }, [intervaloMs]);
  return agora;
}
