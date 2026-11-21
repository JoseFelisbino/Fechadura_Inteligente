import { useEffect, useState, type FormEvent } from 'react';
import { Carregando, Confirmacao, Erro } from '../components/feedback';
import { Icone } from '../components/Icone';
import { useFechadura } from '../contexts/FechaduraContext';
import { useDados } from '../hooks/useDados';
import { ApiError, api } from '../services/api';
import type { Senha, SlotSenha } from '../types';
import { traduzirMotivo } from '../utils/format';

function SituacaoSenha({ senha }: { senha: Senha }) {
  switch (senha.sincronizacao) {
    case 'APLICADA':
      return (
        <span className="situacao situacao-ok">
          <Icone nome="ok" tamanho={14} /> aplicada no Arduino
        </span>
      );
    case 'PENDENTE':
      return (
        <span className="situacao situacao-enviando">
          <span className="girando" aria-hidden="true" /> enviando ao Arduino…
        </span>
      );
    case 'REMOVENDO':
      return (
        <span className="situacao situacao-enviando">
          <span className="girando" aria-hidden="true" /> removendo…
        </span>
      );
    default:
      return (
        <span className="situacao situacao-falhou">
          <Icone nome="x" tamanho={14} /> não aplicada: {traduzirMotivo(senha.motivo)}
        </span>
      );
  }
}

function Formulario(props: { slot: number; inicial?: Senha; aoTerminar: () => void; desativado: boolean }) {
  const [nome, setNome] = useState(props.inicial?.nome ?? '');
  const [senha, setSenha] = useState(props.inicial?.senha ?? '');
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    if (!nome.trim()) return setErro('Informe um nome.');
    if (!/^\d{4,8}$/.test(senha)) return setErro('A senha deve ter de 4 a 8 dígitos (só números).');
    setSalvando(true);
    try {
      await api.salvarSenha(props.slot, nome.trim(), senha);
      props.aoTerminar();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Não foi possível salvar.');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <form className="formulario" onSubmit={salvar} noValidate>
      <label>
        Nome
        <input value={nome} maxLength={16} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Ana" autoFocus />
      </label>
      <label>
        Senha (4 a 8 dígitos)
        <input
          value={senha}
          inputMode="numeric"
          autoComplete="off"
          maxLength={8}
          onChange={(e) => setSenha(e.target.value.replace(/\D/g, ''))}
          placeholder="Ex.: 2580"
        />
      </label>
      {erro && <p className="texto-erro">{erro}</p>}
      <div className="linha-botoes">
        <button type="button" className="botao botao-fantasma" onClick={props.aoTerminar}>
          Cancelar
        </button>
        <button type="submit" className="botao botao-primario" disabled={salvando || props.desativado}>
          {salvando ? 'Salvando…' : 'Salvar e enviar'}
        </button>
      </div>
    </form>
  );
}

function CartaoSlot({ item, desativado, aoMudar }: { item: SlotSenha; desativado: boolean; aoMudar: () => void }) {
  const [editando, setEditando] = useState(false);
  const [visivel, setVisivel] = useState(false);
  const [removendo, setRemovendo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const fecharFormulario = () => {
    setEditando(false);
    aoMudar();
  };

  const remover = async () => {
    setRemovendo(false);
    try {
      await api.removerSenha(item.slot);
      aoMudar();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Não foi possível remover.');
    }
  };

  if (editando) {
    return (
      <section className="cartao">
        <h3>Slot {item.slot}</h3>
        <Formulario slot={item.slot} inicial={'vazio' in item ? undefined : item} aoTerminar={fecharFormulario} desativado={desativado} />
      </section>
    );
  }

  if ('vazio' in item) {
    return (
      <section className="cartao cartao-vazio">
        <h3>Slot {item.slot}</h3>
        <button type="button" className="botao botao-secundario" onClick={() => setEditando(true)} disabled={desativado}>
          <Icone nome="mais" tamanho={18} /> Criar senha
        </button>
      </section>
    );
  }

  return (
    <section className="cartao">
      <div className="linha-titulo">
        <h3>
          {item.nome} <span className="muted pequeno">· slot {item.slot}</span>
        </h3>
        <SituacaoSenha senha={item} />
      </div>
      <div className="senha-linha">
        <code className="senha-valor" aria-label={visivel ? `Senha ${item.senha}` : 'Senha oculta'}>
          {visivel ? item.senha : '•'.repeat(item.senha.length)}
        </code>
        <button
          type="button"
          className="botao-icone"
          onClick={() => setVisivel((v) => !v)}
          aria-label={visivel ? 'Ocultar senha' : 'Mostrar senha'}
        >
          <Icone nome={visivel ? 'olhoFechado' : 'olho'} />
        </button>
      </div>
      {erro && <p className="texto-erro">{erro}</p>}
      <div className="linha-botoes">
        <button type="button" className="botao botao-fantasma" onClick={() => setEditando(true)} disabled={desativado}>
          <Icone nome="lapis" tamanho={16} /> Editar
        </button>
        <button
          type="button"
          className="botao botao-fantasma texto-perigo"
          onClick={() => setRemovendo(true)}
          disabled={desativado || item.sincronizacao === 'REMOVENDO'}
        >
          <Icone nome="lixeira" tamanho={16} /> Remover
        </button>
      </div>
      <Confirmacao
        aberta={removendo}
        titulo="Remover senha?"
        texto={`A senha de ${item.nome} deixa de abrir a porta assim que o Arduino confirmar.`}
        confirmar="Remover"
        perigo
        aoConfirmar={remover}
        aoCancelar={() => setRemovendo(false)}
      />
    </section>
  );
}

export function SenhasPage() {
  const { versoes, semRede } = useFechadura();
  const { dados, erro, carregando, recarregar } = useDados(() => api.senhas(), [versoes.senhas]);

  // Enquanto alguma senha estiver indo para o Arduino, confere de novo a cada segundo
  const aguardando = dados?.some((s) => !('vazio' in s) && (s.sincronizacao === 'PENDENTE' || s.sincronizacao === 'REMOVENDO'));
  useEffect(() => {
    if (!aguardando) return;
    const t = setInterval(() => void recarregar(), 1000);
    return () => clearInterval(t);
  }, [aguardando, recarregar]);

  if (carregando && !dados) return <Carregando />;
  if (erro && !dados) return <Erro mensagem={erro} tentarDeNovo={recarregar} />;

  return (
    <div className="pilha">
      <p className="muted pequeno">
        Até 3 senhas, cada uma com um nome. Ao salvar, a senha é enviada ao Arduino e fica gravada nele: o teclado continua
        funcionando sem internet.
      </p>
      {dados?.map((item) => (
        <CartaoSlot key={item.slot} item={item} desativado={semRede} aoMudar={recarregar} />
      ))}
    </div>
  );
}
