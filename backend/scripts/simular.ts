import 'dotenv/config';
import mqtt from 'mqtt';

/**
 * Simulador da fechadura: publica estados e eventos falsos no broker e responde aos comandos
 * do app como se fosse o Arduino. Serve para demonstrar o app sem a placa.
 *
 *   npm run simular            -> cenas aleatórias a cada ~10 s
 *   npm run simular -- --calmo -> só responde aos comandos (nenhuma cena automática)
 *
 * NÃO rode junto com o Arduino ligado: os dois usam os mesmos tópicos.
 */

const URL = process.env.MQTT_URL || 'mqtt://localhost:1883';
const CALMO = process.argv.includes('--calmo');
const T = {
  eventos: 'fechadura/eventos',
  estado: 'fechadura/estado',
  status: 'fechadura/status',
  comandos: 'fechadura/comandos',
  resposta: 'fechadura/comandos/resposta',
};

type Origem = 'TECLADO' | 'TECLADO_SAIDA' | 'BOTAO_SAIDA' | 'APP' | 'SENSOR' | 'SISTEMA';

const sim = {
  trava: 'FECHADA' as 'ABERTA' | 'FECHADA',
  porta: 'FECHADA' as 'ABERTA' | 'FECHADA' | 'DESCONHECIDA',
  distanciaCm: 4,
  bloqueado: false,
  alarme: false,
  tempoAberturaMs: 5000,
  limiteCm: 10,
  senhas: new Map<number, { nome: string; senha: string }>([[1, { nome: 'Admin', senha: '1234' }]]),
};

const client = mqtt.connect(URL, {
  username: process.env.MQTT_USERNAME || undefined,
  password: process.env.MQTT_PASSWORD || undefined,
  clientId: 'fechadura-simulador',
  clean: true,
  will: { topic: T.status, payload: Buffer.from('{"online":false}'), qos: 1, retain: true },
});

const boot = Date.now().toString(36);
let numero = 0;
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));
const sortear = <X>(lista: X[]) => lista[Math.floor(Math.random() * lista.length)];

function evento(tipo: string, origem: Origem, usuario?: string) {
  numero += 1;
  const msg = { id: `simulador-${boot}-${numero}`, tipo, origem, usuario, timestamp: Date.now() };
  client.publish(T.eventos, JSON.stringify(msg), { qos: 1 });
  console.log(`[evento] ${tipo} / ${origem}${usuario ? ` / ${usuario}` : ''}`);
}

function publicarEstado() {
  // Ruído de ±1 cm na distância, como no sensor real
  const ruido = Math.round(Math.random() * 2 - 1);
  const distancia = sim.porta === 'DESCONHECIDA' ? null : Math.max(1, sim.distanciaCm + ruido);
  client.publish(
    T.estado,
    JSON.stringify({
      trava: sim.trava,
      porta: sim.porta,
      distanciaCm: distancia,
      bloqueado: sim.bloqueado,
      alarme: sim.alarme,
      tempoAberturaMs: sim.tempoAberturaMs,
      limiteCm: sim.limiteCm,
      online: true,
    }),
  );
}

function moverPorta(aberta: boolean) {
  sim.porta = aberta ? 'ABERTA' : 'FECHADA';
  sim.distanciaCm = aberta ? 35 + Math.round(Math.random() * 20) : 4;
}

/** Abre a porta como o Arduino faria: servo em 90°, espera, volta a 0°. */
async function liberar(origem: Origem, usuario?: string, naoFecha = false) {
  sim.trava = 'ABERTA';
  evento('ACESSO_LIBERADO', origem, usuario);
  publicarEstado();
  await esperar(600);
  moverPorta(true);
  evento('PORTA_ABERTA', origem, usuario);
  publicarEstado();
  await esperar(sim.tempoAberturaMs);
  sim.trava = 'FECHADA';
  publicarEstado();
  await esperar(1500);
  if (naoFecha) {
    evento('PORTA_NAO_FECHOU', 'SENSOR');
    await esperar(6000);
  }
  moverPorta(false);
  evento('PORTA_FECHADA', 'SENSOR');
  publicarEstado();
}

async function senhaErrada(vezes: number) {
  for (let i = 0; i < vezes; i++) {
    evento('SENHA_INCORRETA', 'TECLADO');
    await esperar(1200);
  }
  if (vezes >= 3) {
    sim.bloqueado = true;
    evento('BLOQUEIO_INICIO', 'TECLADO');
    publicarEstado();
    await esperar(30_000);
    sim.bloqueado = false;
    evento('BLOQUEIO_FIM', 'SISTEMA');
    publicarEstado();
  }
}

async function forcarPorta() {
  moverPorta(true);
  sim.alarme = true;
  evento('PORTA_FORCADA', 'SENSOR');
  publicarEstado();
  await esperar(8000); // o alarme fica tocando até alguém desligar (pelo app ou com senha)
  if (sim.alarme && Math.random() < 0.5) {
    const s = sim.senhas.get(1);
    sim.alarme = false;
    evento('ALARME_DESLIGADO', 'TECLADO', s?.nome);
  }
  moverPorta(false);
  evento('PORTA_FECHADA', 'SENSOR');
  publicarEstado();
}

function nomeAleatorio() {
  const nomes = [...sim.senhas.values()].map((s) => s.nome);
  return nomes.length ? sortear(nomes) : undefined;
}

async function cenaAleatoria() {
  const sorteio = Math.random();
  if (sorteio < 0.45) await liberar('TECLADO', nomeAleatorio());
  else if (sorteio < 0.6) await liberar(sortear<Origem>(['BOTAO_SAIDA', 'TECLADO_SAIDA']), nomeAleatorio());
  else if (sorteio < 0.8) await senhaErrada(1 + Math.floor(Math.random() * 2));
  else if (sorteio < 0.88) await liberar('TECLADO', nomeAleatorio(), true);
  else if (sorteio < 0.94) await senhaErrada(3);
  else await forcarPorta();
}

let ocupado = false;

function responder(id: string, motivo?: string) {
  client.publish(T.resposta, JSON.stringify(motivo ? { id, ok: false, motivo } : { id, ok: true }), { qos: 1 });
}

async function tratarComando(texto: string) {
  let cmd: { id?: string; tipo?: string; params?: Record<string, unknown> };
  try {
    cmd = JSON.parse(texto);
  } catch {
    return;
  }
  if (!cmd.id) return;
  console.log(`[comando] ${cmd.tipo}`);
  await esperar(300); // atraso de rede, para dar para ver o "enviando..." no app
  const p = cmd.params ?? {};
  switch (cmd.tipo) {
    case 'ABRIR_PORTA':
      responder(cmd.id);
      ocupado = true;
      void liberar('APP').finally(() => (ocupado = false));
      return;
    case 'FECHAR_PORTA':
      sim.trava = 'FECHADA';
      responder(cmd.id);
      break;
    case 'DESLIGAR_ALARME':
      if (sim.alarme) {
        sim.alarme = false;
        evento('ALARME_DESLIGADO', 'APP');
      }
      responder(cmd.id);
      break;
    case 'TESTAR_BUZZER':
    case 'ENVIAR_ESTADO':
      responder(cmd.id);
      break;
    case 'DEFINIR_SENHA': {
      const slot = Number(p.slot);
      const senha = String(p.senha ?? '');
      if (slot < 1 || slot > 3) return responder(cmd.id, 'SLOT_INVALIDO');
      if (!/^\d{4,8}$/.test(senha)) return responder(cmd.id, 'SENHA_INVALIDA');
      sim.senhas.set(slot, { nome: String(p.nome), senha });
      evento('SENHA_ALTERADA', 'APP', String(p.nome));
      responder(cmd.id);
      break;
    }
    case 'REMOVER_SENHA': {
      const slot = Number(p.slot);
      const nome = sim.senhas.get(slot)?.nome;
      sim.senhas.delete(slot);
      evento('SENHA_ALTERADA', 'APP', nome);
      responder(cmd.id);
      break;
    }
    case 'DEFINIR_CONFIG':
      sim.tempoAberturaMs = Number(p.tempoAberturaMs ?? sim.tempoAberturaMs);
      sim.limiteCm = Number(p.limiteCm ?? sim.limiteCm);
      responder(cmd.id);
      break;
    default:
      return responder(cmd.id, 'COMANDO_DESCONHECIDO');
  }
  publicarEstado();
}

client.on('connect', async () => {
  console.log(`Simulador conectado em ${URL}${CALMO ? ' (modo calmo)' : ''}. Ctrl+C para sair.`);
  client.publish(T.status, '{"online":true}', { qos: 1, retain: true });
  client.subscribe(T.comandos, { qos: 1 });
  publicarEstado();
});
client.on('message', (_topico, payload) => void tratarComando(payload.toString('utf8')));
client.on('error', (err) => console.error('Erro MQTT:', err.message));

setInterval(publicarEstado, 2000);

if (!CALMO) {
  (async () => {
    await esperar(3000);
    for (;;) {
      if (!ocupado && client.connected) {
        ocupado = true;
        await cenaAleatoria().finally(() => (ocupado = false));
      }
      await esperar(6000 + Math.random() * 8000);
    }
  })();
}

process.on('SIGINT', () => {
  client.publish(T.status, '{"online":false}', { qos: 1, retain: true }, () => {
    client.end();
    process.exit(0);
  });
});

