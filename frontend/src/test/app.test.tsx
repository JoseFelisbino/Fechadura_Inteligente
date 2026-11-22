import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FechaduraProvider } from '../contexts/FechaduraContext';
import { AppRoutes } from '../routes/AppRoutes';
import type { Estado, Evento } from '../types';
import { haQuanto, tituloEvento } from '../utils/format';
import { MockEventSource } from './setup';

// ---------------------------------------------------------------- API falsa

type Rota = (url: URL, init?: RequestInit) => unknown;
let rotas: Record<string, Rota> = {};
let chamadas: { metodo: string; url: URL; body?: unknown }[] = [];
let semRede = false;

function evento(parcial: Partial<Evento>): Evento {
  return {
    id: crypto.randomUUID(),
    idExterno: crypto.randomUUID(),
    tipo: 'ACESSO_LIBERADO',
    origem: 'TECLADO',
    usuario: null,
    ocorridoEm: new Date().toISOString(),
    recebidoEm: new Date().toISOString(),
    ...parcial,
  };
}

const ESTADO: Estado = {
  online: true,
  ultimaComunicacao: new Date().toISOString(),
  trava: 'FECHADA',
  porta: 'FECHADA',
  distanciaCm: 4,
  bloqueado: false,
  alarme: false,
  portaDesde: new Date(Date.now() - 90_000).toISOString(),
  ultimoAcesso: evento({ usuario: 'Ana' }),
  alertasAtivos: 0,
};

beforeEach(() => {
  localStorage.clear();
  semRede = false;
  chamadas = [];
  rotas = {
    'GET /api/estado': () => ESTADO,
    'GET /api/configuracao': () => ({ tempoAberturaMs: 5000, limiteCm: 10, tempoMaxAbertaS: 30, atualizadoEm: new Date().toISOString() }),
  };
  vi.stubGlobal('fetch', async (entrada: string, init?: RequestInit) => {
    if (semRede) throw new TypeError('Failed to fetch');
    const url = new URL(entrada, 'http://localhost');
    const metodo = init?.method ?? 'GET';
    chamadas.push({ metodo, url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const rota = Object.entries(rotas).find(([chave]) => {
      const [m, caminho] = chave.split(' ');
      return m === metodo && (url.pathname === caminho || (caminho.endsWith('*') && url.pathname.startsWith(caminho.slice(0, -1))));
    });
    if (!rota) return new Response(JSON.stringify({ error: { message: 'não encontrado' } }), { status: 404 });
    return new Response(JSON.stringify({ data: rota[1](url, init) }), { status: 200 });
  });
});

function abrir(caminho = '/') {
  return render(
    <MemoryRouter initialEntries={[caminho]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <FechaduraProvider>
        <AppRoutes />
      </FechaduraProvider>
    </MemoryRouter>,
  );
}

const sse = () => MockEventSource.instances[MockEventSource.instances.length - 1];

// ---------------------------------------------------------------- Início

describe('Início', () => {
  it('mostra a porta, a trava e o último acesso', async () => {
    abrir();
    expect(await screen.findByRole('heading', { name: 'Porta fechada' })).toBeInTheDocument();
    expect(screen.getByText(/há 1 min 3\d s · 4 cm/)).toBeInTheDocument();
    expect(screen.getByText('Trancada')).toBeInTheDocument();
    expect(screen.getByText('Ana')).toBeInTheDocument();
    expect(screen.getByText(/Entrada · teclado/)).toBeInTheDocument();
  });

  it('atualiza em tempo real quando chega um estado pelo SSE', async () => {
    abrir();
    await screen.findByRole('heading', { name: 'Porta fechada' });
    act(() => {
      sse().emit('estado', { ...ESTADO, porta: 'ABERTA', trava: 'ABERTA', distanciaCm: 40, ultimaComunicacao: new Date().toISOString() });
    });
    expect(await screen.findByRole('heading', { name: 'Porta aberta' })).toBeInTheDocument();
    expect(screen.getByText('Liberada')).toBeInTheDocument();
  });

  it('mostra o alarme com destaque', async () => {
    rotas['GET /api/estado'] = () => ({ ...ESTADO, alarme: true, porta: 'ABERTA', alertasAtivos: 1 });
    abrir();
    expect(await screen.findByRole('heading', { name: /Alarme! Porta forçada/ })).toBeInTheDocument();
    expect(screen.getByText('1 alerta ativo')).toBeInTheDocument();
  });

  it('fechadura offline: "sem comunicação" e botões desativados', async () => {
    rotas['GET /api/estado'] = () => ({ ...ESTADO, online: false });
    abrir();
    expect(await screen.findByRole('heading', { name: 'Sem comunicação' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Abrir porta/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Testar buzzer/ })).toBeDisabled();
  });

  it('abrir porta pede confirmação e mostra enviando → confirmado', async () => {
    const id = crypto.randomUUID();
    rotas['POST /api/comandos'] = () => ({ id, tipo: 'ABRIR_PORTA', status: 'PENDENTE', motivo: null });
    rotas['GET /api/comandos/*'] = () => ({ id, tipo: 'ABRIR_PORTA', status: 'OK', motivo: null });
    const user = userEvent.setup();
    abrir();
    await screen.findByRole('heading', { name: 'Porta fechada' });

    await user.click(screen.getByRole('button', { name: /Abrir porta/ }));
    const dialogo = screen.getByRole('dialog');
    expect(chamadas.some((c) => c.metodo === 'POST')).toBe(false); // ainda não enviou
    await user.click(within(dialogo).getByRole('button', { name: 'Abrir porta' }));

    expect(await screen.findByText(/enviando/)).toBeInTheDocument();
    expect(await screen.findByText(/confirmado/, {}, { timeout: 3000 })).toBeInTheDocument();
    expect(chamadas.find((c) => c.metodo === 'POST')?.body).toEqual({ tipo: 'ABRIR_PORTA' });
  });

  it('mostra o motivo quando o comando falha', async () => {
    rotas['POST /api/comandos'] = () => ({ id: crypto.randomUUID(), tipo: 'TESTAR_BUZZER', status: 'FALHOU', motivo: 'DISPOSITIVO_OFFLINE' });
    const user = userEvent.setup();
    abrir();
    await screen.findByRole('heading', { name: 'Porta fechada' });
    await user.click(screen.getByRole('button', { name: /Testar buzzer/ }));
    expect(await screen.findByText(/falhou: a fechadura está sem comunicação/)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------- Sem conexão

describe('Sem conexão com o servidor', () => {
  it('mostra a última leitura guardada, o aviso e desativa os botões', async () => {
    localStorage.setItem('fechadura:ultimo-estado', JSON.stringify({ ...ESTADO, porta: 'ABERTA' }));
    semRede = true;
    abrir();
    expect(await screen.findByText(/Sem conexão — mostrando a última leitura/)).toBeInTheDocument();
    expect(screen.getByText(/última leitura: porta aberta/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Abrir porta/ })).toBeDisabled();
  });

  it('quando o SSE cai, passa a recarregar a cada 5 s', async () => {
    abrir();
    await screen.findByRole('heading', { name: 'Porta fechada' });
    act(() => sse().emit('pronto'));
    expect(screen.getByTitle('Tempo real')).toBeInTheDocument();
    act(() => sse().fail());
    expect(screen.getByTitle('Atualizando a cada 5 s')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------- Senhas

describe('Senhas', () => {
  beforeEach(() => {
    rotas['GET /api/senhas'] = () => [
      { slot: 1, nome: 'Ana', senha: '2580', sincronizacao: 'APLICADA', motivo: null, atualizadoEm: new Date().toISOString() },
      { slot: 2, nome: 'Bruno', senha: '4321', sincronizacao: 'FALHOU', motivo: 'SEM_RESPOSTA', atualizadoEm: new Date().toISOString() },
      { slot: 3, vazio: true },
    ];
  });

  it('esconde a senha e mostra com o botão de olho', async () => {
    const user = userEvent.setup();
    abrir('/senhas');
    expect(await screen.findByText('aplicada no Arduino')).toBeInTheDocument();
    expect(screen.getByText(/não aplicada: a fechadura não respondeu/)).toBeInTheDocument();
    expect(screen.queryByText('2580')).not.toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: 'Mostrar senha' })[0]);
    expect(screen.getByText('2580')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Ocultar senha' }));
    expect(screen.queryByText('2580')).not.toBeInTheDocument();
  });

  it('valida a senha antes de enviar e salva no slot vazio', async () => {
    rotas['PUT /api/senhas/3'] = () => ({ senha: {}, comando: {} });
    const user = userEvent.setup();
    abrir('/senhas');
    await user.click(await screen.findByRole('button', { name: /Criar senha/ }));

    await user.type(screen.getByLabelText('Nome'), 'Visitante');
    await user.type(screen.getByLabelText(/Senha \(4 a 8 dígitos\)/), '12a');
    await user.click(screen.getByRole('button', { name: 'Salvar e enviar' }));
    expect(screen.getByText(/de 4 a 8 dígitos/)).toBeInTheDocument();
    expect(chamadas.some((c) => c.metodo === 'PUT')).toBe(false);

    await user.type(screen.getByLabelText(/Senha \(4 a 8 dígitos\)/), '45');
    await user.click(screen.getByRole('button', { name: 'Salvar e enviar' }));
    await waitFor(() => expect(chamadas.find((c) => c.metodo === 'PUT')?.body).toEqual({ nome: 'Visitante', senha: '1245' }));
  });
});

// ---------------------------------------------------------------- Histórico e alertas

describe('Histórico', () => {
  it('deixa entrada, saída e app bem claros e filtra por tipo', async () => {
    rotas['GET /api/eventos'] = () => [
      evento({ origem: 'TECLADO', usuario: 'Ana' }),
      evento({ origem: 'BOTAO_SAIDA' }),
      evento({ origem: 'APP' }),
      evento({ tipo: 'SENHA_INCORRETA' }),
    ];
    const user = userEvent.setup();
    abrir('/historico');
    expect(await screen.findByText('Entrada liberada')).toBeInTheDocument();
    expect(screen.getByText('Saída liberada')).toBeInTheDocument();
    expect(screen.getByText('Aberta pelo app')).toBeInTheDocument();
    expect(screen.getByText('Senha incorreta')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Alarme' }));
    await waitFor(() => {
      const ultima = chamadas.filter((c) => c.url.pathname === '/api/eventos').at(-1);
      expect(ultima?.url.searchParams.get('tipo')).toBe('PORTA_FORCADA,ALARME_DESLIGADO');
    });
  });
});

describe('Alertas', () => {
  it('lista ativos e resolvidos e resolve pelo app', async () => {
    const id = crypto.randomUUID();
    rotas['GET /api/alertas'] = () => [
      { id, tipo: 'PORTA_FORCADA', status: 'ATIVO', mensagem: 'Porta aberta sem liberação.', criadoEm: new Date().toISOString(), resolvidoEm: null },
      { id: crypto.randomUUID(), tipo: 'OFFLINE', status: 'RESOLVIDO', mensagem: 'Sem comunicação.', criadoEm: new Date().toISOString(), resolvidoEm: new Date().toISOString() },
    ];
    rotas[`PATCH /api/alertas/${id}/resolver`] = () => ({ id, status: 'RESOLVIDO' });
    const user = userEvent.setup();
    abrir('/alertas');
    expect(await screen.findByText('Porta forçada')).toBeInTheDocument();
    expect(screen.getByText('Fechadura offline')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Resolver' }));
    await waitFor(() => expect(chamadas.some((c) => c.metodo === 'PATCH' && c.url.pathname.endsWith(`${id}/resolver`))).toBe(true));
  });
});

// ---------------------------------------------------------------- Notificações

describe('Notificações', () => {
  function notificacaoFalsa(permissaoInicial: NotificationPermission) {
    const criadas: { titulo: string; corpo?: string }[] = [];
    class NotificationFalsa {
      static permission = permissaoInicial;
      static requestPermission = vi.fn(async () => {
        NotificationFalsa.permission = 'granted';
        return 'granted' as const;
      });
      constructor(titulo: string, opcoes?: NotificationOptions) {
        criadas.push({ titulo, corpo: opcoes?.body });
      }
    }
    vi.stubGlobal('Notification', NotificationFalsa);
    return { criadas, NotificationFalsa };
  }

  // Chega um alerta pelo SSE; espera o app recarregar o estado e mostrar a notificação.
  async function emitirAlerta(alerta: object) {
    await act(async () => {
      sse().emit('alerta', alerta);
      await new Promise((r) => setTimeout(r, 30));
    });
  }

  async function emitirEvento(e: Evento) {
    await act(async () => {
      sse().emit('evento', e);
      await new Promise((r) => setTimeout(r, 30));
    });
  }

  it('ativa em Ajustes e avisa alerta novo (resolvido não avisa)', async () => {
    const { criadas, NotificationFalsa } = notificacaoFalsa('default');
    const user = userEvent.setup();
    abrir('/ajustes');
    await user.click(await screen.findByRole('button', { name: /Ativar notificações/ }));
    expect(NotificationFalsa.requestPermission).toHaveBeenCalled();
    expect(await screen.findByRole('button', { name: 'Desativar' })).toBeInTheDocument();

    const alerta = { id: 'a1', tipo: 'SENHAS_INCORRETAS', mensagem: 'Teclado bloqueado.', criadoEm: new Date().toISOString(), resolvidoEm: null };
    await emitirAlerta({ ...alerta, status: 'ATIVO' });
    expect(criadas).toEqual([{ titulo: 'Fechadura: Senhas incorretas', corpo: 'Teclado bloqueado.' }]);

    await emitirAlerta({ ...alerta, status: 'RESOLVIDO' });
    expect(criadas).toHaveLength(1);
  });

  it('desativada não avisa nada', async () => {
    const { criadas } = notificacaoFalsa('granted'); // permissão dada, mas o usuário não ligou no app
    abrir('/');
    await screen.findByText('Ana', { exact: false });
    await emitirAlerta({ id: 'a2', tipo: 'PORTA_FORCADA', status: 'ATIVO', mensagem: 'x', criadoEm: '', resolvidoEm: null });
    expect(criadas).toHaveLength(0);
  });

  it('senha incorreta aparece na hora em qualquer tela, conta as seguidas e notifica', async () => {
    localStorage.setItem('fechadura:notificacoes', 'sim');
    const { criadas } = notificacaoFalsa('granted');
    const user = userEvent.setup();
    abrir('/graficos');
    await waitFor(() => expect(sse()).toBeDefined());

    await emitirEvento(evento({ tipo: 'SENHA_INCORRETA', origem: 'TECLADO' }));
    const faixa = () => document.querySelector('.faixa-senha');
    expect(faixa()).toHaveTextContent('Senha incorreta no teclado');
    expect(criadas).toEqual([{ titulo: 'Fechadura: senha incorreta', corpo: 'Alguém digitou uma senha errada no teclado.' }]);

    await emitirEvento(evento({ tipo: 'SENHA_INCORRETA', origem: 'TECLADO_SAIDA' }));
    expect(faixa()).toHaveTextContent('Senha incorreta na saída (2 seguidas)');

    await user.click(screen.getByRole('button', { name: 'Fechar aviso' }));
    expect(faixa()).toBeNull();
  });

  it('senha incorreta antiga (fila reenviada ao reconectar) não vira aviso', async () => {
    abrir('/');
    await waitFor(() => expect(sse()).toBeDefined());
    await emitirEvento(evento({ tipo: 'SENHA_INCORRETA', ocorridoEm: new Date(Date.now() - 5 * 60_000).toISOString() }));
    expect(document.querySelector('.faixa-senha')).toBeNull();
  });

  it('mostra como liberar quando o navegador bloqueou', async () => {
    notificacaoFalsa('denied');
    abrir('/ajustes');
    expect(await screen.findByText(/notificações foram bloqueadas/)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------- Formatação

describe('Formatação', () => {
  it('"há quanto tempo"', () => {
    const agora = Date.parse('2026-11-20T12:00:00Z');
    expect(haQuanto('2026-11-20T12:00:00Z', agora)).toBe('agora');
    expect(haQuanto('2026-11-20T11:59:30Z', agora)).toBe('há 30 s');
    expect(haQuanto('2026-11-20T11:45:00Z', agora)).toBe('há 15 min');
    expect(haQuanto('2026-11-18T12:00:00Z', agora)).toBe('há 2 dias');
  });

  it('títulos dos eventos de acesso', () => {
    expect(tituloEvento({ tipo: 'ACESSO_LIBERADO', origem: 'TECLADO' })).toBe('Entrada liberada');
    expect(tituloEvento({ tipo: 'ACESSO_LIBERADO', origem: 'TECLADO_SAIDA' })).toBe('Saída liberada');
    expect(tituloEvento({ tipo: 'ACESSO_LIBERADO', origem: 'APP' })).toBe('Aberta pelo app');
    expect(tituloEvento({ tipo: 'PORTA_FORCADA', origem: 'SENSOR' })).toBe('Porta forçada — alarme');
  });
});
