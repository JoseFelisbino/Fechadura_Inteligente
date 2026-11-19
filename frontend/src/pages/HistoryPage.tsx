import { useState, type FormEvent } from 'react';
import { EventTable } from '../components/EventTable';
import { EmptyState, ErrorMessage, LoadingState } from '../components/feedback';
import { PageHeader } from '../components/PageHeader';
import { Pagination } from '../components/Pagination';
import { useAsync } from '../hooks/useAsync';
import { ApiError } from '../services/api';
import { deviceService } from '../services/device.service';
import { eventService } from '../services/event.service';
import { monitoredPointService } from '../services/monitored-point.service';
import type { Direction, EventFilters, HistoryEvent } from '../types';
import { EVENT_TYPE_LABEL, localInputToIso } from '../utils/format';

interface FormState {
  from: string;
  to: string;
  deviceId: string;
  pointId: string;
  eventType: string;
  result: string;
  state: string;
}

const EMPTY: FormState = { from: '', to: '', deviceId: '', pointId: '', eventType: '', result: '', state: '' };
const PAGE_SIZE = 20;

function toFilters(form: FormState, page: number): EventFilters {
  return {
    from: localInputToIso(form.from),
    to: localInputToIso(form.to),
    deviceId: form.deviceId || undefined,
    pointId: form.pointId || undefined,
    eventType: (form.eventType || undefined) as EventFilters['eventType'],
    result: (form.result || undefined) as EventFilters['result'],
    state: (form.state || undefined) as EventFilters['state'],
    page,
    pageSize: PAGE_SIZE,
  };
}

export function HistoryPage() {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [applied, setApplied] = useState<FormState>(EMPTY);
  const [page, setPage] = useState(1);
  const [actionError, setActionError] = useState<string | null>(null);

  const options = useAsync(
    () => Promise.all([deviceService.list(), monitoredPointService.list()]),
    [],
    { realtime: false },
  );
  const events = useAsync(() => eventService.list(toFilters(applied, page)), [applied, page]);

  function update<K extends keyof FormState>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setApplied(form);
    setPage(1);
  }

  function handleClear() {
    setForm(EMPTY);
    setApplied(EMPTY);
    setPage(1);
  }

  async function handleDirection(event: HistoryEvent, direction: Direction) {
    setActionError(null);
    try {
      await eventService.setDirection(event.id, direction);
      events.reload();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Falha ao salvar a direção.');
    }
  }

  const [devices, points] = options.data ?? [[], []];

  return (
    <>
      <PageHeader
        title="Histórico"
        description="Acessos da fechadura e mudanças dos sensores."
        updatedAt={events.updatedAt}
        refreshing={events.refreshing}
      />

      <form className="card filters" onSubmit={handleSubmit} aria-label="Filtros do histórico">
        <label className="field">
          <span>De</span>
          <input type="datetime-local" value={form.from} onChange={(e) => update('from', e.target.value)} />
        </label>
        <label className="field">
          <span>Até</span>
          <input type="datetime-local" value={form.to} onChange={(e) => update('to', e.target.value)} />
        </label>
        <label className="field">
          <span>Dispositivo</span>
          <select value={form.deviceId} onChange={(e) => update('deviceId', e.target.value)}>
            <option value="">Todos</option>
            {devices.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Ponto</span>
          <select value={form.pointId} onChange={(e) => update('pointId', e.target.value)}>
            <option value="">Todos</option>
            {points.map((p) => (
              <option key={p.id} value={p.id}>{p.name} ({p.location})</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Tipo de evento</span>
          <select value={form.eventType} onChange={(e) => update('eventType', e.target.value)}>
            <option value="">Todos</option>
            {Object.entries(EVENT_TYPE_LABEL).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Resultado do acesso</span>
          <select value={form.result} onChange={(e) => update('result', e.target.value)}>
            <option value="">Todos</option>
            <option value="SUCCESS">Sucesso</option>
            <option value="FAILURE">Falha</option>
          </select>
        </label>
        <label className="field">
          <span>Estado do sensor</span>
          <select value={form.state} onChange={(e) => update('state', e.target.value)}>
            <option value="">Todos</option>
            <option value="OPEN">Aberto</option>
            <option value="CLOSED">Fechado</option>
          </select>
        </label>
        <div className="filters-actions">
          <button type="submit" className="btn btn-primary">Filtrar</button>
          <button type="button" className="btn btn-secondary" onClick={handleClear}>Limpar</button>
        </div>
      </form>

      {actionError && <ErrorMessage error={actionError} />}

      <section className="card">
        {events.loading && <LoadingState />}
        {events.error && <ErrorMessage error={events.error} onRetry={events.reload} />}
        {events.data && events.data.items.length === 0 && <EmptyState title="Nenhum evento encontrado para os filtros." />}
        {events.data && events.data.items.length > 0 && (
          <>
            <EventTable events={events.data.items} onDirectionChange={handleDirection} />
            <Pagination meta={events.data.meta} onChange={setPage} />
          </>
        )}
      </section>
    </>
  );
}
