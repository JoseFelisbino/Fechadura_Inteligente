import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { ConnectionBanner, ConnectionStatus } from '../components/ConnectionStatus';
import { useAuth } from '../contexts/AuthContext';

const LINKS = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/monitoramento', label: 'Monitoramento' },
  { to: '/historico', label: 'Histórico' },
  { to: '/alertas', label: 'Alertas' },
  { to: '/configuracoes', label: 'Configurações' },
];

export function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-icon" aria-hidden="true">🔒</span>
          Fechadura Inteligente
        </div>
        <nav className="nav" aria-label="Navegação principal">
          {LINKS.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.end} className={({ isActive }) => (isActive ? 'active' : undefined)}>
              {l.label}
            </NavLink>
          ))}
        </nav>
        <div className="topbar-user">
          <ConnectionStatus />
          <span className="small muted">{user?.name}</span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={handleLogout}>
            Sair
          </button>
        </div>
      </header>
      <ConnectionBanner />
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
