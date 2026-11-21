import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, api } from '../services/api';
import type { Comando } from '../types';
import { traduzirMotivo } from '../utils/format';

export type SituacaoComando =
  | { fase: 'ocioso' }
  | { fase: 'enviando' }
  | { fase: 'confirmado' }
  | { fase: 'falhou'; motivo: string };

const INTERVALO_MS = 700;
const DESISTE_APOS_MS = 25_000; // o backend expira em 15 s; isto é só uma rede de segurança

/**
 * Envia um comando e acompanha até a resposta do Arduino:
 * "enviando…" → "confirmado" / "falhou: motivo".
 */
export function useComando() {
  const [situacao, setSituacao] = useState<SituacaoComando>({ fase: 'ocioso' });
  const vivo = useRef(true);
  const geracao = useRef(0);

  useEffect(() => {
    vivo.current = true;
    return () => {
      vivo.current = false;
    };
  }, []);

  const acompanhar = useCallback(async (criar: () => Promise<Comando | null>) => {
    const minha = ++geracao.current;
    const atual = () => vivo.current && minha === geracao.current;
    setSituacao({ fase: 'enviando' });
    try {
      let comando = await criar();
      if (!comando) {
        if (atual()) setSituacao({ fase: 'confirmado' }); // nada precisou ir para o Arduino
        return;
      }
      const inicio = Date.now();
      while (comando.status === 'PENDENTE' && Date.now() - inicio < DESISTE_APOS_MS) {
        await new Promise((r) => setTimeout(r, INTERVALO_MS));
        if (!atual()) return;
        comando = await api.comando(comando.id);
      }
      if (!atual()) return;
      if (comando.status === 'OK') setSituacao({ fase: 'confirmado' });
      else setSituacao({ fase: 'falhou', motivo: traduzirMotivo(comando.status === 'PENDENTE' ? 'SEM_RESPOSTA' : comando.motivo) });
    } catch (err) {
      if (atual()) setSituacao({ fase: 'falhou', motivo: err instanceof ApiError ? err.message : 'erro inesperado' });
    }
  }, []);

  const limpar = useCallback(() => setSituacao({ fase: 'ocioso' }), []);
  return { situacao, acompanhar, limpar };
}
