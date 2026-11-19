import { Link } from 'react-router-dom';
import { EmptyState } from '../components/feedback';

export function NotFoundPage() {
  return (
    <EmptyState title="Página não encontrada.">
      <Link to="/">Voltar ao dashboard</Link>
    </EmptyState>
  );
}
