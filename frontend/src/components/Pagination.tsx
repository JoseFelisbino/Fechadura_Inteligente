import type { PageMeta } from '../types';

export function Pagination({ meta, onChange }: { meta: PageMeta; onChange: (page: number) => void }) {
  const totalPages = Math.max(1, Math.ceil(meta.total / meta.pageSize));
  return (
    <nav className="pagination" aria-label="Paginação">
      <button type="button" className="btn btn-secondary btn-sm" disabled={meta.page <= 1} onClick={() => onChange(meta.page - 1)}>
        Anterior
      </button>
      <span className="small">
        Página {meta.page} de {totalPages} · {meta.total} registro(s)
      </span>
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        disabled={meta.page >= totalPages}
        onClick={() => onChange(meta.page + 1)}
      >
        Próxima
      </button>
    </nav>
  );
}
