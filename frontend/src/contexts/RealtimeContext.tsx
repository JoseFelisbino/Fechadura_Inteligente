import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { API_URL } from '../services/api';

export type RealtimeStatus = 'connecting' | 'open' | 'closed';

interface RealtimeContextValue {
  status: RealtimeStatus;
  /** Incrementado a cada novo evento recebido (ou reconexão); as telas recarregam os dados. */
  version: number;
  lastMessageAt: Date | null;
}

const RealtimeContext = createContext<RealtimeContextValue>({ status: 'closed', version: 0, lastMessageAt: null });

const EVENT_TYPES = ['sensor-event', 'access-event', 'point-updated', 'device-status', 'alert-created', 'alert-resolved'];
/** Se o SSE cair, recarrega periodicamente como contingência (polling). */
const FALLBACK_POLL_MS = 30_000;

/**
 * Conexão Server-Sent Events com o backend (`GET /api/stream`), autenticada pelo cookie.
 * O EventSource reconecta automaticamente; enquanto isso, o status fica "closed"
 * e o painel avisa sobre a perda de conexão.
 */
export function RealtimeProvider({ children, enabled }: { children: ReactNode; enabled: boolean }) {
  const [status, setStatus] = useState<RealtimeStatus>('closed');
  const [version, setVersion] = useState(0);
  const [lastMessageAt, setLastMessageAt] = useState<Date | null>(null);
  const hadErrorRef = useRef(false);

  useEffect(() => {
    if (!enabled || typeof EventSource === 'undefined') return;
    setStatus('connecting');
    const source = new EventSource(`${API_URL}/stream`, { withCredentials: true });

    const bump = () => {
      setVersion((v) => v + 1);
      setLastMessageAt(new Date());
    };

    source.addEventListener('ready', () => {
      setStatus('open');
      // Após uma queda, recarrega para obter o que foi perdido.
      if (hadErrorRef.current) bump();
      hadErrorRef.current = false;
    });
    EVENT_TYPES.forEach((type) => source.addEventListener(type, bump));
    source.onerror = () => {
      hadErrorRef.current = true;
      setStatus(source.readyState === EventSource.CLOSED ? 'closed' : 'connecting');
    };

    return () => {
      source.close();
      setStatus('closed');
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled || status === 'open') return;
    const timer = setInterval(() => setVersion((v) => v + 1), FALLBACK_POLL_MS);
    return () => clearInterval(timer);
  }, [enabled, status]);

  const value = useMemo(() => ({ status, version, lastMessageAt }), [status, version, lastMessageAt]);
  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

export function useRealtime() {
  return useContext(RealtimeContext);
}
