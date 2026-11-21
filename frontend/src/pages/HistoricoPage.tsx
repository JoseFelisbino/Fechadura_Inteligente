import { useEffect, useState } from 'react';
import { Carregando, Erro, Vazio } from '../components/feedback';
import { Icone, type NomeIcone } from '../components/Icone';
import { useFechadura } from '../contexts/FechaduraContext';
import { api } from '../services/api';
import type { Evento, Origem, TipoEvento } from '../types';
import { formatarDataHora, ROTULO_ORIGEM, tituloEvento, tomEvento } from '../utils/format';

const FILTROS: { rotulo: string; tipos: TipoEvento[] }[] = [
  { rotulo: 'Todos', tipos: [] },
  { rotulo: 'Acessos', tipos: ['ACESSO_LIBERADO'] },
  { rotulo: 'Senha errada', tipos: ['SENHA_INCORRETA', 'BLOQUEIO_INICIO', 'BLOQUEIO_FIM'] },
  { rotulo: 'Porta', tipos: ['PORTA_ABERTA', 'PORTA_FECHADA', 'PORTA_NAO_FECHOU'] },
  { rotulo: 'Alarme', tipos: ['PORTA_FORCADA', 'ALARME_DESLIGADO'] },
  { rotulo: 'Senhas', tipos: ['SENHA_ALTERADA'] },
];

const PERIODOS = [
  { rotulo: 'Hoje', dias: 0 },
  { rotulo: '7 dias', dias: 7 },
  { rotulo: '30 dias', dias: 30 },
  { rotulo: 'Tudo', dias: -1 },
] as const;

const POR_PAGINA = 20;

const ICONE_ORIGEM: Record<Origem, NomeIcone> = {
  TECLADO: 'entrada',
  TECLADO_SAIDA: 'saida',
  BOTAO_SAIDA: 'saida',
  APP: 'celular',
  SENSOR: 'sensor',
  SISTEMA: 'ajustes',
};

function inicioDoPeriodo(dias: number) {
  if (dias < 0) return undefined;
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - dias);
  return d.toISOString();
}

function ItemEvento({ evento }: { evento: Evento }) {
  return (
    <li className={`evento evento-${tomEvento(evento.tipo)}`}>
      <span className="evento-icone">
        <Icone nome={ICONE_ORIGEM[evento.origem]} tamanho={18} />
      </span>
      <div className="evento-texto">
        <strong>
          {tituloEvento(evento)}
          {evento.usuario && <span className="evento-usuario"> · {evento.usuario}</span>}
        </strong>
        <span className="muted pequeno">
          <span className={`origem origem-${evento.origem.toLowerCase()}`}>{ROTULO_ORIGEM[evento.origem]}</span>
          {' · '}
          {formatarDataHora(evento.ocorridoEm)}
        </span>
      </div>
    </li>
  );
}

export function HistoricoPage() {
  const { versoes } = useFechadura();
  const [filtro, setFiltro] = useState(0);
  const [periodo, setPeriodo] = useState(1);
  const [paginas, setPaginas] = useState(1);
  const [itens, setItens] = useState<Evento[]>([]);
  const [total, setTotal] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);

  // Recarrega quando muda o filtro, o período, a quantidade de páginas ou chega evento novo
  useEffect(() => {
    let ativo = true;
    api
      .eventos({
        tipo: FILTROS[filtro].tipos.join(',') || undefined,
        de: inicioDoPeriodo(PERIODOS[periodo].dias),
        page: 1,
        porPagina: POR_PAGINA * paginas,
      })
      .then((r) => {
        if (!ativo) return;
        setItens(r.itens);
        setTotal(r.total);
        setErro(null);
      })
      .catch((e: Error) => ativo && setErro(e.message))
      .finally(() => ativo && setCarregando(false));
    return () => {
      ativo = false;
    };
  }, [filtro, periodo, paginas, versoes.eventos]);

  const escolherFiltro = (i: number) => {
    setFiltro(i);
    setPaginas(1);
  };
  const escolherPeriodo = (i: number) => {
    setPeriodo(i);
    setPaginas(1);
  };

  return (
    <div className="pilha">
      <div className="filtros" role="group" aria-label="Tipo de evento">
        {FILTROS.map((f, i) => (
          <button key={f.rotulo} type="button" className={`filtro ${i === filtro ? 'ativo' : ''}`} aria-pressed={i === filtro} onClick={() => escolherFiltro(i)}>
            {f.rotulo}
          </button>
        ))}
      </div>
      <div className="filtros" role="group" aria-label="Período">
        {PERIODOS.map((p, i) => (
          <button key={p.rotulo} type="button" className={`filtro filtro-periodo ${i === periodo ? 'ativo' : ''}`} aria-pressed={i === periodo} onClick={() => escolherPeriodo(i)}>
            {p.rotulo}
          </button>
        ))}
      </div>

      {carregando && itens.length === 0 ? (
        <Carregando />
      ) : erro && itens.length === 0 ? (
        <Erro mensagem={erro} />
      ) : itens.length === 0 ? (
        <Vazio>Nenhum evento neste filtro.</Vazio>
      ) : (
        <section className="cartao sem-padding">
          <ul className="lista-eventos">
            {itens.map((e) => (
              <ItemEvento key={e.id} evento={e} />
            ))}
          </ul>
        </section>
      )}

      {itens.length < total && (
        <button type="button" className="botao botao-secundario" onClick={() => setPaginas((p) => p + 1)}>
          Carregar mais ({total - itens.length})
        </button>
      )}
    </div>
  );
}
