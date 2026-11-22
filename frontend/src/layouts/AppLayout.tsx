import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Icone, type NomeIcone } from '../components/Icone';
import { useFechadura } from '../contexts/FechaduraContext';
import { formatarHora } from '../utils/format';

const ABAS: { para: string; rotulo: string; icone: NomeIcone }[] = [
  { para: '/', rotulo: 'Início', icone: 'inicio' },
  { para: '/senhas', rotulo: 'Senhas', icone: 'chave' },
  { para: '/graficos', rotulo: 'Gráficos', icone: 'grafico' },
  { para: '/historico', rotulo: 'Histórico', icone: 'historico' },
  { para: '/alertas', rotulo: 'Alertas', icone: 'sino' },
];

const TITULOS: Record<string, string> = {
  '/': 'Fechadura',
  '/senhas': 'Senhas',
  '/graficos': 'Gráficos',
  '/historico': 'Histórico',
  '/alertas': 'Alertas',
  '/ajustes': 'Ajustes',
};

export function AppLayout() {
  const { estado, semRede, conexao, avisoSenha, fecharAvisoSenha } = useFechadura();
  const { pathname } = useLocation();
  const alertas = estado?.alertasAtivos ?? 0;

  return (
    <div className="app">
      <header className="topo">
        <h1>{TITULOS[pathname] ?? 'Fechadura'}</h1>
        <div className="topo-lado">
          <span
            className={`ponto ${semRede ? 'ponto-off' : conexao === 'tempo-real' ? 'ponto-on' : 'ponto-espera'}`}
            title={semRede ? 'Sem conexão' : conexao === 'tempo-real' ? 'Tempo real' : 'Atualizando a cada 5 s'}
          />
          <NavLink to="/ajustes" className="botao-icone" aria-label="Ajustes">
            <Icone nome="ajustes" />
          </NavLink>
        </div>
      </header>

      {semRede && (
        <div className="faixa-offline" role="status">
          <Icone nome="semSinal" tamanho={16} /> Sem conexão — mostrando a última leitura. Os botões ficam desativados.
        </div>
      )}

      {avisoSenha && (
        <div className="faixa-senha" role="alert">
          <Icone nome="chave" tamanho={18} />
          <span>
            <strong>Senha incorreta</strong> {avisoSenha.saida ? 'na saída' : 'no teclado'}
            {avisoSenha.tentativas > 1 && ` (${avisoSenha.tentativas} seguidas)`} às {formatarHora(avisoSenha.ultimaEm)}
          </span>
          <button type="button" className="botao-icone" aria-label="Fechar aviso" onClick={fecharAvisoSenha}>
            ×
          </button>
        </div>
      )}

      <main className="conteudo">
        <Outlet />
      </main>

      <nav className="abas" aria-label="Navegação principal">
        {ABAS.map((aba) => (
          <NavLink key={aba.para} to={aba.para} end={aba.para === '/'} className="aba">
            <span className="aba-icone">
              <Icone nome={aba.icone} tamanho={22} />
              {aba.para === '/alertas' && alertas > 0 && <span className="selo">{alertas}</span>}
            </span>
            <span>{aba.rotulo}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
