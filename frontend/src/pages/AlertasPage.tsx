import { useState } from 'react';
import { Carregando, Erro, Vazio } from '../components/feedback';
import { Icone } from '../components/Icone';
import { useFechadura } from '../contexts/FechaduraContext';
import { useAgora, useDados } from '../hooks/useDados';
import { ApiError, api } from '../services/api';
import type { Alerta } from '../types';
import { formatarDataHora, haQuanto, TITULO_ALERTA } from '../utils/format';

function ItemAlerta({ alerta, agora, aoResolver, desativado }: { alerta: Alerta; agora: number; aoResolver?: () => void; desativado?: boolean }) {
  return (
    <li className={`alerta ${alerta.status === 'ATIVO' ? 'alerta-ativo' : ''}`}>
      <Icone nome={alerta.tipo === 'OFFLINE' ? 'semSinal' : 'alerta'} tamanho={20} />
      <div className="alerta-texto">
        <strong>{TITULO_ALERTA[alerta.tipo]}</strong>
        <span className="pequeno">{alerta.mensagem}</span>
        <span className="muted pequeno">
          {alerta.status === 'ATIVO'
            ? `Desde ${formatarDataHora(alerta.criadoEm)} (${haQuanto(alerta.criadoEm, agora)})`
            : `${formatarDataHora(alerta.criadoEm)} → resolvido ${formatarDataHora(alerta.resolvidoEm)}`}
        </span>
      </div>
      {aoResolver && (
        <button type="button" className="botao botao-pequeno botao-secundario" onClick={aoResolver} disabled={desativado}>
          Resolver
        </button>
      )}
    </li>
  );
}

export function AlertasPage() {
  const { versoes, semRede, recarregar: recarregarEstado } = useFechadura();
  const agora = useAgora(10_000);
  const { dados, erro, carregando, recarregar } = useDados(() => api.alertas(), [versoes.alertas]);
  const [erroAcao, setErroAcao] = useState<string | null>(null);

  const resolver = async (id: string) => {
    try {
      await api.resolverAlerta(id);
      setErroAcao(null);
      await Promise.all([recarregar(), recarregarEstado()]);
    } catch (e) {
      setErroAcao(e instanceof ApiError ? e.message : 'Não foi possível resolver.');
    }
  };

  if (carregando && !dados) return <Carregando />;
  if (erro && !dados) return <Erro mensagem={erro} tentarDeNovo={recarregar} />;

  const ativos = dados?.filter((a) => a.status === 'ATIVO') ?? [];
  const resolvidos = dados?.filter((a) => a.status === 'RESOLVIDO') ?? [];

  return (
    <div className="pilha">
      {erroAcao && <Erro mensagem={erroAcao} />}
      <section>
        <h2 className="subtitulo">Ativos</h2>
        {ativos.length === 0 ? (
          <Vazio>Nenhum alerta ativo. Tudo certo!</Vazio>
        ) : (
          <ul className="cartao sem-padding lista-alertas">
            {ativos.map((a) => (
              <ItemAlerta key={a.id} alerta={a} agora={agora} aoResolver={() => void resolver(a.id)} desativado={semRede} />
            ))}
          </ul>
        )}
      </section>
      <section>
        <h2 className="subtitulo">Resolvidos</h2>
        {resolvidos.length === 0 ? (
          <Vazio>Nenhum alerta resolvido ainda.</Vazio>
        ) : (
          <ul className="cartao sem-padding lista-alertas">
            {resolvidos.map((a) => (
              <ItemAlerta key={a.id} alerta={a} agora={agora} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
