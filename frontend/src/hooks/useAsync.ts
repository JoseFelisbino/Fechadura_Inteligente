import { useCallback, useEffect, useRef, useState, type DependencyList } from 'react';
import { useRealtime } from '../contexts/RealtimeContext';

interface AsyncState<T> {
  data: T | null;
  error: Error | null;
  /** Primeira carga (sem dados ainda). */
  loading: boolean;
  /** Recarga em segundo plano (mantém os dados atuais na tela). */
  refreshing: boolean;
  /** Momento da última atualização bem-sucedida. */
  updatedAt: Date | null;
  reload: () => void;
}

/**
 * Executa uma chamada assíncrona e recarrega quando as dependências mudam
 * e, opcionalmente, quando chegam novos eventos em tempo real.
 */
export function useAsync<T>(fn: () => Promise<T>, deps: DependencyList, options: { realtime?: boolean } = {}): AsyncState<T> {
  const { realtime = true } = options;
  const { version } = useRealtime();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [manual, setManual] = useState(0);
  const requestId = useRef(0);
  const hasData = useRef(false);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(fn, deps);

  useEffect(() => {
    const id = ++requestId.current;
    if (hasData.current) setRefreshing(true);
    else setLoading(true);

    run()
      .then((result) => {
        if (id !== requestId.current) return;
        setData(result);
        setError(null);
        setUpdatedAt(new Date());
        hasData.current = true;
      })
      .catch((err: Error) => {
        if (id !== requestId.current) return;
        setError(err);
      })
      .finally(() => {
        if (id !== requestId.current) return;
        setLoading(false);
        setRefreshing(false);
      });
  }, [run, manual, realtime ? version : 0]);

  const reload = useCallback(() => setManual((n) => n + 1), []);
  return { data, error, loading, refreshing, updatedAt, reload };
}
