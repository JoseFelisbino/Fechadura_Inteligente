import { useEffect, useState, type FormEvent } from 'react';
import { Carregando, Erro, SituacaoLinha } from '../components/feedback';
import { Icone } from '../components/Icone';
import { useFechadura } from '../contexts/FechaduraContext';
import { useComando } from '../hooks/useComando';
import { useDados } from '../hooks/useDados';
import { api } from '../services/api';
import { formatarDataHora } from '../utils/format';

interface PromptInstalacao extends Event {
  prompt: () => Promise<void>;
}

/** Botão "Instalar app" (Chrome/Android). No iPhone: Compartilhar → Adicionar à Tela de Início. */
function Instalar() {
  const [prompt, setPrompt] = useState<PromptInstalacao | null>(null);
  useEffect(() => {
    const guardar = (e: Event) => {
      e.preventDefault();
      setPrompt(e as PromptInstalacao);
    };
    window.addEventListener('beforeinstallprompt', guardar);
    return () => window.removeEventListener('beforeinstallprompt', guardar);
  }, []);

  const instalado = window.matchMedia?.('(display-mode: standalone)').matches;
  if (instalado) return <p className="muted pequeno">O app já está instalado neste aparelho.</p>;
  if (!prompt)
    return (
      <p className="muted pequeno">
        Para instalar: no Chrome, menu ⋮ → <strong>Instalar app</strong>. No iPhone (Safari): Compartilhar →{' '}
        <strong>Adicionar à Tela de Início</strong>.
      </p>
    );
  return (
    <button type="button" className="botao botao-secundario" onClick={() => void prompt.prompt().then(() => setPrompt(null))}>
      <Icone nome="instalar" tamanho={18} /> Instalar app
    </button>
  );
}

export function AjustesPage() {
  const { versoes, semRede, estado, conexao } = useFechadura();
  const { dados, erro, carregando, recarregar } = useDados(() => api.configuracao(), [versoes.configuracao]);
  const { situacao, acompanhar } = useComando();
  const [abertura, setAbertura] = useState('');
  const [limite, setLimite] = useState('');
  const [maxAberta, setMaxAberta] = useState('');
  const [erroForm, setErroForm] = useState<string | null>(null);

  useEffect(() => {
    if (!dados) return;
    setAbertura(String(dados.tempoAberturaMs / 1000));
    setLimite(String(dados.limiteCm));
    setMaxAberta(String(dados.tempoMaxAbertaS));
  }, [dados]);

  const salvar = (e: FormEvent) => {
    e.preventDefault();
    const tempoAberturaMs = Math.round(Number(abertura) * 1000);
    const limiteCm = Number(limite);
    const tempoMaxAbertaS = Number(maxAberta);
    if (!(tempoAberturaMs >= 1000 && tempoAberturaMs <= 60000)) return setErroForm('Tempo de abertura: de 1 a 60 segundos.');
    if (!(Number.isInteger(limiteCm) && limiteCm >= 2 && limiteCm <= 100)) return setErroForm('Limite: de 2 a 100 cm.');
    if (!(Number.isInteger(tempoMaxAbertaS) && tempoMaxAbertaS >= 5 && tempoMaxAbertaS <= 3600))
      return setErroForm('Tempo máximo aberta: de 5 a 3600 segundos.');
    setErroForm(null);
    // Tempo de abertura e limite vão para o Arduino (DEFINIR_CONFIG); a linha mostra a confirmação.
    void acompanhar(async () => {
      const r = await api.salvarConfiguracao({ tempoAberturaMs, limiteCm, tempoMaxAbertaS });
      void recarregar();
      return r.comando;
    });
  };

  if (carregando && !dados) return <Carregando />;
  if (erro && !dados) return <Erro mensagem={erro} tentarDeNovo={recarregar} />;

  return (
    <div className="pilha">
      <form className="cartao formulario" onSubmit={salvar} noValidate>
        <h3>Fechadura</h3>
        <label>
          Tempo de abertura (segundos)
          <input type="number" inputMode="decimal" min={1} max={60} step={0.5} value={abertura} onChange={(e) => setAbertura(e.target.value)} />
          <span className="muted pequeno">Quanto tempo o servo fica em 90° antes de fechar.</span>
        </label>
        <label>
          Limite do sensor (cm)
          <input type="number" inputMode="numeric" min={2} max={100} value={limite} onChange={(e) => setLimite(e.target.value)} />
          <span className="muted pequeno">A porta conta como fechada quando a distância é menor ou igual a isto.</span>
        </label>
        <label>
          Tempo máximo aberta (segundos)
          <input type="number" inputMode="numeric" min={5} max={3600} value={maxAberta} onChange={(e) => setMaxAberta(e.target.value)} />
          <span className="muted pequeno">Depois disso o app cria o alerta "aberta tempo demais".</span>
        </label>
        {erroForm && <p className="texto-erro">{erroForm}</p>}
        <div className="linha-botoes">
          <SituacaoLinha situacao={situacao} />
          <button type="submit" className="botao botao-primario" disabled={semRede || situacao.fase === 'enviando'}>
            Salvar
          </button>
        </div>
        {dados && <p className="muted pequeno">Última alteração: {formatarDataHora(dados.atualizadoEm)}</p>}
      </form>

      <section className="cartao">
        <h3>Conexão</h3>
        <ul className="lista-info">
          <li>
            <span>App ↔ servidor</span>
            <strong>{semRede ? 'sem conexão' : conexao === 'tempo-real' ? 'tempo real (SSE)' : 'atualizando a cada 5 s'}</strong>
          </li>
          <li>
            <span>Fechadura</span>
            <strong>{estado?.online ? 'online' : 'offline'}</strong>
          </li>
          <li>
            <span>Última comunicação</span>
            <strong>{formatarDataHora(estado?.ultimaComunicacao)}</strong>
          </li>
        </ul>
      </section>

      <section className="cartao">
        <h3>Instalar no celular</h3>
        <Instalar />
      </section>
    </div>
  );
}
