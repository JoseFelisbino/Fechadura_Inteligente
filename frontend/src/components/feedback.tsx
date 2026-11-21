import { useEffect, useRef, type ReactNode } from 'react';
import type { SituacaoComando } from '../hooks/useComando';
import { Icone } from './Icone';

export function Carregando({ texto = 'Carregando…' }: { texto?: string }) {
  return (
    <p className="vazio" role="status">
      {texto}
    </p>
  );
}

export function Erro({ mensagem, tentarDeNovo }: { mensagem: string; tentarDeNovo?: () => void }) {
  return (
    <div className="erro" role="alert">
      <span>{mensagem}</span>
      {tentarDeNovo && (
        <button type="button" className="botao botao-pequeno" onClick={tentarDeNovo}>
          Tentar de novo
        </button>
      )}
    </div>
  );
}

export function Vazio({ children }: { children: ReactNode }) {
  return <p className="vazio">{children}</p>;
}

/** Linha "enviando… → confirmado / falhou" abaixo de um botão ou formulário. */
export function SituacaoLinha({ situacao }: { situacao: SituacaoComando }) {
  if (situacao.fase === 'ocioso') return null;
  if (situacao.fase === 'enviando')
    return (
      <span className="situacao situacao-enviando" role="status">
        <span className="girando" aria-hidden="true" /> enviando…
      </span>
    );
  if (situacao.fase === 'confirmado')
    return (
      <span className="situacao situacao-ok" role="status">
        <Icone nome="ok" tamanho={14} /> confirmado
      </span>
    );
  return (
    <span className="situacao situacao-falhou" role="status">
      <Icone nome="x" tamanho={14} /> falhou: {situacao.motivo}
    </span>
  );
}

/** Janela de confirmação simples. Esc ou clique fora cancelam. */
export function Confirmacao(props: {
  aberta: boolean;
  titulo: string;
  texto: string;
  confirmar: string;
  perigo?: boolean;
  aoConfirmar: () => void;
  aoCancelar: () => void;
}) {
  const botao = useRef<HTMLButtonElement>(null);
  const { aberta, aoCancelar } = props;
  useEffect(() => {
    if (!aberta) return;
    botao.current?.focus();
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && aoCancelar();
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [aberta, aoCancelar]);

  if (!aberta) return null;
  return (
    <div className="fundo-dialogo" onClick={aoCancelar}>
      <div className="dialogo" role="dialog" aria-modal="true" aria-labelledby="dialogo-titulo" onClick={(e) => e.stopPropagation()}>
        <h2 id="dialogo-titulo">{props.titulo}</h2>
        <p>{props.texto}</p>
        <div className="dialogo-botoes">
          <button type="button" className="botao botao-fantasma" onClick={aoCancelar}>
            Cancelar
          </button>
          <button
            ref={botao}
            type="button"
            className={`botao ${props.perigo ? 'botao-perigo' : 'botao-primario'}`}
            onClick={props.aoConfirmar}
          >
            {props.confirmar}
          </button>
        </div>
      </div>
    </div>
  );
}
