import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Confirmacao, SituacaoLinha } from '../components/feedback';
import { Icone, type NomeIcone } from '../components/Icone';
import { useFechadura } from '../contexts/FechaduraContext';
import { useComando } from '../hooks/useComando';
import { useAgora } from '../hooks/useDados';
import { api } from '../services/api';
import type { Estado, TipoComando } from '../types';
import { duracao, haQuanto, ROTULO_ORIGEM, tituloEvento } from '../utils/format';

type Visual = { classe: string; titulo: string; icone: NomeIcone };

/** O que o cartão grande da porta mostra. */
function visualDaPorta(estado: Estado | null, semRede: boolean): Visual {
  if (!estado) return { classe: 'cartao-neutro', titulo: 'Carregando…', icone: 'portaFechada' };
  if (semRede || !estado.online) return { classe: 'cartao-neutro', titulo: 'Sem comunicação', icone: 'semSinal' };
  if (estado.alarme) return { classe: 'cartao-perigo', titulo: 'Alarme! Porta forçada', icone: 'alerta' };
  if (estado.porta === 'ABERTA') return { classe: 'cartao-aviso', titulo: 'Porta aberta', icone: 'portaAberta' };
  if (estado.porta === 'FECHADA') return { classe: 'cartao-ok', titulo: 'Porta fechada', icone: 'portaFechada' };
  return { classe: 'cartao-neutro', titulo: 'Sensor sem leitura', icone: 'sensor' };
}

function BotaoComando(props: {
  tipo: TipoComando;
  rotulo: string;
  icone: NomeIcone;
  destaque?: boolean;
  desativado: boolean;
  confirmar?: string;
}) {
  const { situacao, acompanhar } = useComando();
  const [perguntando, setPerguntando] = useState(false);
  const enviar = () => {
    setPerguntando(false);
    void acompanhar(() => api.enviarComando(props.tipo));
  };

  return (
    <div className="comando">
      <button
        type="button"
        className={`botao botao-grande ${props.destaque ? 'botao-perigo' : 'botao-secundario'}`}
        disabled={props.desativado || situacao.fase === 'enviando'}
        onClick={() => (props.confirmar ? setPerguntando(true) : enviar())}
      >
        <Icone nome={props.icone} />
        {props.rotulo}
      </button>
      <SituacaoLinha situacao={situacao} />
      {props.confirmar && (
        <Confirmacao
          aberta={perguntando}
          titulo={`${props.rotulo}?`}
          texto={props.confirmar}
          confirmar={props.rotulo}
          aoConfirmar={enviar}
          aoCancelar={() => setPerguntando(false)}
        />
      )}
    </div>
  );
}

export function InicioPage() {
  const { estado, semRede } = useFechadura();
  const agora = useAgora();
  const visual = visualDaPorta(estado, semRede);
  const online = !!estado?.online && !semRede;
  const acesso = estado?.ultimoAcesso;

  return (
    <div className="pilha">
      <section className={`cartao-porta ${visual.classe}`} aria-live="polite">
        <Icone nome={visual.icone} tamanho={44} />
        <div>
          <h2>{visual.titulo}</h2>
          {estado && online && (
            <p>
              {estado.portaDesde && `há ${duracao(estado.portaDesde, agora)}`}
              {estado.distanciaCm !== null && ` · ${estado.distanciaCm} cm`}
            </p>
          )}
          {estado && !online && (
            <p>
              Última comunicação {haQuanto(estado.ultimaComunicacao, agora)}
              {estado.porta !== 'DESCONHECIDA' && ` · última leitura: porta ${estado.porta.toLowerCase()}`}
            </p>
          )}
        </div>
      </section>

      <section className="chips" aria-label="Situação">
        <span className={`chip ${estado?.trava === 'ABERTA' ? 'chip-aviso' : 'chip-ok'}`}>
          <Icone nome={estado?.trava === 'ABERTA' ? 'cadeadoAberto' : 'cadeado'} tamanho={16} />
          {estado?.trava === 'ABERTA' ? 'Liberada' : 'Trancada'}
        </span>
        {estado?.bloqueado && (
          <span className="chip chip-perigo">
            <Icone nome="cadeado" tamanho={16} /> Teclado bloqueado
          </span>
        )}
        <span className={`chip ${estado?.alarme ? 'chip-perigo' : 'chip-neutro'}`}>
          <Icone nome={estado?.alarme ? 'som' : 'silencio'} tamanho={16} />
          {estado?.alarme ? 'Alarme tocando' : 'Alarme desligado'}
        </span>
        <span className={`chip ${online ? 'chip-ok' : 'chip-neutro'}`}>
          <span className={`ponto ${online ? 'ponto-on' : 'ponto-off'}`} />
          {online ? 'Online' : 'Offline'}
        </span>
      </section>

      {!!estado?.alertasAtivos && (
        <Link to="/alertas" className="aviso-alertas">
          <Icone nome="alerta" tamanho={18} />
          {estado.alertasAtivos === 1 ? '1 alerta ativo' : `${estado.alertasAtivos} alertas ativos`}
        </Link>
      )}

      <section className="cartao">
        <h3>Último acesso</h3>
        {acesso ? (
          <p className="ultimo-acesso">
            <strong>{acesso.usuario || tituloEvento(acesso)}</strong>
            <span className="muted">
              {ROTULO_ORIGEM[acesso.origem]} · {haQuanto(acesso.ocorridoEm, agora)}
            </span>
          </p>
        ) : (
          <p className="muted">Nenhum acesso registrado.</p>
        )}
      </section>

      <section className="grade-comandos" aria-label="Comandos">
        <BotaoComando
          tipo="ABRIR_PORTA"
          rotulo="Abrir porta"
          icone="cadeadoAberto"
          desativado={!online}
          confirmar="A porta vai abrir agora e fechar sozinha depois do tempo de abertura."
        />
        <BotaoComando tipo="FECHAR_PORTA" rotulo="Fechar porta" icone="cadeado" desativado={!online} />
        <BotaoComando
          tipo="DESLIGAR_ALARME"
          rotulo="Desligar alarme"
          icone="silencio"
          destaque={!!estado?.alarme}
          desativado={!online}
        />
        <BotaoComando tipo="TESTAR_BUZZER" rotulo="Testar buzzer" icone="som" desativado={!online} />
      </section>
      {!online && !semRede && estado && (
        <p className="muted pequeno centro">A fechadura está sem comunicação: os comandos ficam desativados.</p>
      )}
    </div>
  );
}
