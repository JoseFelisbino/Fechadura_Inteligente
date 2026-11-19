import { useState, type FormEvent } from 'react';
import { DeviceStatus } from '../components/DeviceStatus';
import { EmptyState, ErrorMessage, LoadingState } from '../components/feedback';
import { PageHeader } from '../components/PageHeader';
import { useAuth } from '../contexts/AuthContext';
import { useAsync } from '../hooks/useAsync';
import { ApiError, type ApiErrorDetail } from '../services/api';
import { deviceService } from '../services/device.service';
import { monitoredPointService, type PointInput } from '../services/monitored-point.service';
import type { Device, MonitoredPoint, PointType } from '../types';
import { formatDuration, POINT_TYPE_LABEL } from '../utils/format';

function errorText(err: unknown) {
  if (err instanceof ApiError) {
    const fields = err.details.filter((d: ApiErrorDetail) => d.field).map((d) => `${d.field}: ${d.message}`);
    return fields.length ? `${err.message} ${fields.join('; ')}` : err.message;
  }
  return 'Erro inesperado.';
}

// ---------------------------------------------------------------- Dispositivos

function DeviceForm({ device, onDone }: { device?: Device; onDone: () => void }) {
  const [name, setName] = useState(device?.name ?? '');
  const [description, setDescription] = useState(device?.description ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (name.trim().length < 2) return setError('Informe um nome com pelo menos 2 caracteres.');
    setSaving(true);
    setError(null);
    try {
      const input = { name: name.trim(), description: description.trim() || undefined };
      if (device) await deviceService.update(device.id, input);
      else await deviceService.create(input);
      onDone();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="inline-form" onSubmit={submit} aria-label={device ? 'Editar dispositivo' : 'Novo dispositivo'}>
      <label className="field">
        <span>Nome</span>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
      </label>
      <label className="field">
        <span>Descrição</span>
        <input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={255} />
      </label>
      {error && <p className="field-error" role="alert">{error}</p>}
      <div className="filters-actions">
        <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>Salvar</button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={onDone}>Cancelar</button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------- Pontos

function PointForm({ point, devices, onDone }: { point?: MonitoredPoint; devices: Device[]; onDone: () => void }) {
  const [form, setForm] = useState({
    name: point?.name ?? '',
    location: point?.location ?? '',
    type: (point?.type ?? 'DOOR') as PointType,
    maxOpenSeconds: String(point?.maxOpenSeconds ?? 300),
    deviceId: point?.device.id ?? devices[0]?.id ?? '',
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const seconds = Number(form.maxOpenSeconds);
    if (form.name.trim().length < 2 || form.location.trim().length < 2) {
      return setError('Informe nome e cômodo com pelo menos 2 caracteres.');
    }
    if (!Number.isInteger(seconds) || seconds < 10) return setError('O limite deve ser um número inteiro de, no mínimo, 10 segundos.');
    if (!form.deviceId) return setError('Selecione o dispositivo responsável pelo sensor.');

    setSaving(true);
    setError(null);
    const input: PointInput = { ...form, name: form.name.trim(), location: form.location.trim(), maxOpenSeconds: seconds };
    try {
      if (point) await monitoredPointService.update(point.id, input);
      else await monitoredPointService.create(input);
      onDone();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="inline-form" onSubmit={submit} aria-label={point ? 'Editar ponto' : 'Novo ponto'}>
      <label className="field">
        <span>Nome</span>
        <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Porta principal" />
      </label>
      <label className="field">
        <span>Cômodo / localização</span>
        <input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Sala" />
      </label>
      <label className="field">
        <span>Tipo</span>
        <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as PointType })}>
          <option value="DOOR">Porta</option>
          <option value="WINDOW">Janela</option>
        </select>
      </label>
      <label className="field">
        <span>Tempo máximo aberto (segundos)</span>
        <input
          type="number"
          min={10}
          step={1}
          value={form.maxOpenSeconds}
          onChange={(e) => setForm({ ...form, maxOpenSeconds: e.target.value })}
        />
      </label>
      <label className="field">
        <span>Dispositivo</span>
        <select value={form.deviceId} onChange={(e) => setForm({ ...form, deviceId: e.target.value })}>
          {devices.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
      </label>
      {error && <p className="field-error" role="alert">{error}</p>}
      <div className="filters-actions">
        <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>Salvar</button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={onDone}>Cancelar</button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------- Página

export function SettingsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const { data, error, loading, updatedAt, refreshing, reload } = useAsync(
    () => Promise.all([deviceService.list(), monitoredPointService.list()]),
    [],
  );
  const [editingDevice, setEditingDevice] = useState<string | 'new' | null>(null);
  const [editingPoint, setEditingPoint] = useState<string | 'new' | null>(null);

  const done = (setter: (v: null) => void) => () => {
    setter(null);
    reload();
  };

  return (
    <>
      <PageHeader
        title="Configurações"
        description="Cadastro de dispositivos e de portas/janelas monitoradas."
        updatedAt={updatedAt}
        refreshing={refreshing}
      />
      {!isAdmin && <p className="banner banner-info">Somente administradores podem cadastrar ou editar.</p>}
      {loading && <LoadingState />}
      {error && <ErrorMessage error={error} onRetry={reload} />}
      {data && (
        <>
          <section className="card">
            <div className="section-title">
              <h2>Dispositivos</h2>
              {isAdmin && editingDevice === null && (
                <button type="button" className="btn btn-primary btn-sm" onClick={() => setEditingDevice('new')}>
                  Novo dispositivo
                </button>
              )}
            </div>
            <p className="muted small">
              A credencial do dispositivo é gerada no servidor com <code>npm run device:provision -- --id &lt;id&gt;</code> e
              nunca é exibida no painel. A senha da fechadura fica somente no microcontrolador.
            </p>
            {editingDevice === 'new' && <DeviceForm onDone={done(setEditingDevice)} />}
            {data[0].length === 0 ? (
              <EmptyState title="Nenhum dispositivo cadastrado." />
            ) : (
              <ul className="plain-list">
                {data[0].map((d) => (
                  <li key={d.id}>
                    {editingDevice === d.id ? (
                      <DeviceForm device={d} onDone={done(setEditingDevice)} />
                    ) : (
                      <div className="row-between">
                        <div>
                          <strong>{d.name}</strong> {d.description && <span className="muted">· {d.description}</span>}
                          <br />
                          <DeviceStatus status={d.status} lastSeenAt={d.lastSeenAt} />
                          <div className="small muted">
                            ID: <code>{d.id}</code> · {d.pointsCount} ponto(s) ·{' '}
                            {d.hasCredential ? 'credencial provisionada' : 'credencial pendente'}
                          </div>
                        </div>
                        {isAdmin && (
                          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditingDevice(d.id)}>
                            Editar
                          </button>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card">
            <div className="section-title">
              <h2>Portas e janelas</h2>
              {isAdmin && editingPoint === null && data[0].length > 0 && (
                <button type="button" className="btn btn-primary btn-sm" onClick={() => setEditingPoint('new')}>
                  Novo ponto
                </button>
              )}
            </div>
            {data[0].length === 0 && <p className="muted small">Cadastre um dispositivo antes dos pontos monitorados.</p>}
            {editingPoint === 'new' && <PointForm devices={data[0]} onDone={done(setEditingPoint)} />}
            {data[1].length === 0 ? (
              <EmptyState title="Nenhuma porta ou janela cadastrada." />
            ) : (
              <ul className="plain-list">
                {data[1].map((p) => (
                  <li key={p.id}>
                    {editingPoint === p.id ? (
                      <PointForm point={p} devices={data[0]} onDone={done(setEditingPoint)} />
                    ) : (
                      <div className="row-between">
                        <div>
                          <strong>{p.name}</strong> <span className="muted">· {POINT_TYPE_LABEL[p.type]} · {p.location}</span>
                          <div className="small muted">
                            Limite: {formatDuration(p.maxOpenSeconds)} · Dispositivo: {p.device.name} · ID: <code>{p.id}</code>
                          </div>
                        </div>
                        {isAdmin && (
                          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditingPoint(p.id)}>
                            Editar
                          </button>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </>
  );
}
