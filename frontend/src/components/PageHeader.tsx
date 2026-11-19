import type { ReactNode } from 'react';
import { formatDateTime } from '../utils/format';

interface Props {
  title: string;
  description?: string;
  updatedAt?: Date | null;
  refreshing?: boolean;
  actions?: ReactNode;
}

export function PageHeader({ title, description, updatedAt, refreshing, actions }: Props) {
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        {description && <p className="muted">{description}</p>}
      </div>
      <div className="page-header-side">
        {updatedAt !== undefined && (
          <span className="muted small" aria-live="polite">
            {refreshing ? 'Atualizando...' : `Última atualização: ${formatDateTime(updatedAt)}`}
          </span>
        )}
        {actions}
      </div>
    </header>
  );
}
