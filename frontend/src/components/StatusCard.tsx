interface Props {
  label: string;
  value: number | string;
  tone?: 'neutral' | 'ok' | 'warn' | 'danger';
  hint?: string;
}

export function StatusCard({ label, value, tone = 'neutral', hint }: Props) {
  return (
    <div className={`status-card tone-${tone}`}>
      <span className="status-card-label">{label}</span>
      <span className="status-card-value">{value}</span>
      {hint && <span className="status-card-hint">{hint}</span>}
    </div>
  );
}
