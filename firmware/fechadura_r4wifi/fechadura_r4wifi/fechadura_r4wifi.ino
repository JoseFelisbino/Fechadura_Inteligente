// =============================================================================
// Fechadura Inteligente — Arduino Uno R4 WiFi
// Projeto Integrador UNIBAVE — Trilha C: Segurança e Acesso Inteligente
//
// Peças: teclado 4x4, micro servo (a porta), ultrassônico HC-SR04 (confirma se a porta fechou),
// buzzer, 1 LED, botão de saída e a matriz de LEDs da própria placa.
//
// Tudo o que é segurança roda AQUI, sem precisar de Wi-Fi, broker ou backend:
//   senha + '#'        -> abre a porta (entrada)
//   'D' + senha + '#'  -> abre a porta (saída pelo teclado)
//   botão D12          -> abre a porta (saída, sem senha: o botão fica do lado de dentro)
//   '*'                -> apaga o que foi digitado
//   3 senhas erradas   -> bloqueio de 30 s
//   porta aberta sem liberação -> alarme (desliga com senha correta ou pelo app)
//
// O loop nunca usa delay() longo: cada parte olha o relógio (millis) e faz só o que é preciso.
// =============================================================================

#include <Arduino.h>
#include <ArduinoJson.h>

#include "config.h"
#include "matriz.h"
#include "memoria.h"
#include "porta.h"
#include "rede.h"
#include "sinais.h"
#include "teclado.h"

// ----------------------------------------------------------------------- Peças
static Teclado teclado;
static PortaServo porta;
static SensorPorta sensor;
static Buzzer buzzer;
static LedStatus led;
static Matriz matriz;

// ----------------------------------------------------------------------- Estado
// Digitação
static char digitado[SENHA_MAX + 1];
static uint8_t quantidadeDigitada = 0;
static bool passouDoLimite = false;  // digitou mais que SENHA_MAX: a senha vai ser recusada
static bool modoSaida = false;       // começou com 'D'
static unsigned long ultimaTecla = 0;

// Erros e bloqueio
static uint8_t errosSeguidos = 0;
static bool bloqueado = false;
static unsigned long fimDoBloqueio = 0;
static unsigned long ultimoBipeBloqueio = 0;

// Alarme e avisos
static bool alarme = false;
static unsigned long conferirFechamentoEm = 0;  // 0 = nada agendado
static bool avisoNaoFechou = false;

// Quem abriu a porta por último (vai junto nos eventos PORTA_ABERTA/PORTA_FECHADA)
static Origem origemLiberacao = Origem::SENSOR;
static char usuarioLiberacao[NOME_MAX + 1] = "";

// Tela temporária (✓ ou ✗)
static Tela telaTemporaria = Tela::OCIOSO;
static unsigned long fimTelaTemporaria = 0;

// Botão de saída (com debounce)
static bool botaoAnterior = false;
static unsigned long botaoMudouEm = 0;
static bool botaoEstavel = false;

// ----------------------------------------------------------------------- Ações

static void limparDigitacao() {
  memset(digitado, 0, sizeof(digitado));
  quantidadeDigitada = 0;
  passouDoLimite = false;
  modoSaida = false;
}

static void mostrarPorUmTempo(Tela tela) {
  telaTemporaria = tela;
  fimTelaTemporaria = millis() + TELA_TEMPORARIA_MS;
}

static void desligarAlarme(Origem origem, const char *usuario) {
  if (!alarme) return;
  alarme = false;
  buzzer.continuo(false);
  registrarEvento(TipoEvento::ALARME_DESLIGADO, origem, usuario);
  pedirEnvioDoEstado();
}

static void dispararAlarme() {
  if (alarme) return;
  alarme = true;
  buzzer.continuo(true);
  registrarEvento(TipoEvento::PORTA_FORCADA, Origem::SENSOR);
  pedirEnvioDoEstado();
}

// Abre a porta (servo em 90°) por memoria.tempoAberturaMs.
static void liberarPorta(Origem origem, const char *usuario) {
  porta.abrir(memoria.tempoAberturaMs);
  conferirFechamentoEm = 0;
  avisoNaoFechou = false;
  origemLiberacao = origem;
  strncpy(usuarioLiberacao, usuario ? usuario : "", NOME_MAX);
  usuarioLiberacao[NOME_MAX] = '\0';
  buzzer.bipar(1, 120);
  mostrarPorUmTempo(Tela::LIBERADO);
  registrarEvento(TipoEvento::ACESSO_LIBERADO, origem, usuario);
  pedirEnvioDoEstado();
}

static void iniciarBloqueio() {
  bloqueado = true;
  fimDoBloqueio = millis() + BLOQUEIO_MS;
  limparDigitacao();
  registrarEvento(TipoEvento::BLOQUEIO_INICIO, Origem::TECLADO);
  pedirEnvioDoEstado();
}

static void encerrarBloqueio() {
  bloqueado = false;
  errosSeguidos = 0;
  registrarEvento(TipoEvento::BLOQUEIO_FIM, Origem::SISTEMA);
  pedirEnvioDoEstado();
}

// '#' foi apertado: confere a senha digitada.
static void conferirSenha() {
  Origem origem = modoSaida ? Origem::TECLADO_SAIDA : Origem::TECLADO;
  int slot = passouDoLimite ? -1 : senhaConferir(digitado);
  limparDigitacao();

  if (slot >= 0) {
    errosSeguidos = 0;
    const char *nome = memoria.slots[slot].nome;
    desligarAlarme(origem, nome);  // senha correta também desliga o alarme
    liberarPorta(origem, nome);
    return;
  }

  errosSeguidos++;
  buzzer.bipar(2, 150);
  mostrarPorUmTempo(Tela::NEGADO);
  registrarEvento(TipoEvento::SENHA_INCORRETA, origem);
  if (errosSeguidos >= MAX_ERROS) iniciarBloqueio();
}

static bool ecoTeclas = false;  // diagnóstico: 'k' no Serial mostra cada tecla (inclusive os dígitos)

static void tratarTecla(char tecla) {
  ultimaTecla = millis();
  if (ecoTeclas) {
    Serial.print("[tecla] ");
    Serial.println(tecla);
  }
  if (bloqueado) return;  // durante o bloqueio o teclado é ignorado

  if (tecla == '*') {
    limparDigitacao();
    return;
  }
  if (tecla == '#') {
    if (quantidadeDigitada > 0 || passouDoLimite) conferirSenha();
    return;
  }
  if (tecla == 'D') {  // 'D' no começo = saída
    limparDigitacao();
    modoSaida = true;
    return;
  }
  if (tecla < '0' || tecla > '9') return;  // A, B e C não fazem nada

  if (quantidadeDigitada < SENHA_MAX) digitado[quantidadeDigitada++] = tecla;
  else passouDoLimite = true;
}

// O sensor mudou de estado.
static void portaMudou(EstadoPorta antes, EstadoPorta agora) {
  if (agora == EstadoPorta::ABERTA) {
    // Trancada (servo em 0°) e a porta abriu sem ninguém liberar = porta forçada.
    // Só conta a partir de FECHADA: leitura desconhecida (sensor com problema) não dispara o alarme.
    if (!porta.aberta() && antes == EstadoPorta::FECHADA && !alarme) {
      dispararAlarme();
    } else {
      registrarEvento(TipoEvento::PORTA_ABERTA, porta.aberta() ? origemLiberacao : Origem::SENSOR,
                      porta.aberta() ? usuarioLiberacao : "");
    }
  } else if (agora == EstadoPorta::FECHADA) {
    avisoNaoFechou = false;
    registrarEvento(TipoEvento::PORTA_FECHADA, Origem::SENSOR);
  } else {
    Serial.println("[sensor] sem eco: estado desconhecido (confira a ligacao do HC-SR04)");
  }
  pedirEnvioDoEstado();
}

// Chamado VERIFICAR_FECHAMENTO_MS depois de o servo voltar a 0°.
static void conferirSeFechou() {
  if (sensor.estado() != EstadoPorta::ABERTA) return;
  avisoNaoFechou = true;
  buzzer.bipar(3, 100);
  registrarEvento(TipoEvento::PORTA_NAO_FECHOU, Origem::SENSOR);
}

static void lerBotaoSaida(unsigned long agora) {
  bool apertado = digitalRead(PINO_BOTAO_SAIDA) == LOW;  // INPUT_PULLUP: apertado = LOW
  if (apertado != botaoAnterior) {
    botaoAnterior = apertado;
    botaoMudouEm = agora;
  }
  if (agora - botaoMudouEm < 50 || apertado == botaoEstavel) return;  // espera 50 ms estável
  botaoEstavel = apertado;
  if (apertado) liberarPorta(Origem::BOTAO_SAIDA, "");  // funciona até durante o bloqueio
}

// ----------------------------------------------------------------------- Saídas (LED e matriz)

static void atualizarIndicadores(unsigned long agora) {
  ModoLed modoLed = ModoLed::APAGADO;
  if (alarme) modoLed = ModoLed::PISCA_RAPIDO;
  else if (bloqueado) modoLed = ModoLed::PISCA_DEVAGAR;
  else if (porta.aberta()) modoLed = ModoLed::ACESO;
  led.atualizar(modoLed, agora);

  bool pisca = (agora / 400) % 2;
  if (alarme) {
    matriz.mostrar(Tela::ALARME, 0, pisca);
  } else if (bloqueado) {
    matriz.mostrar(Tela::BLOQUEADO, (uint8_t)((fimDoBloqueio - agora + 999) / 1000), true);
  } else if ((long)(fimTelaTemporaria - agora) > 0) {
    matriz.mostrar(telaTemporaria, 0, true);
  } else if (quantidadeDigitada > 0 || modoSaida) {
    matriz.mostrar(modoSaida ? Tela::DIGITANDO_SAIDA : Tela::DIGITANDO, quantidadeDigitada, true);
  } else if (porta.aberta()) {
    matriz.mostrar(Tela::LIBERADO, 0, true);
  } else if (avisoNaoFechou) {
    matriz.mostrar(Tela::NAO_FECHOU, 0, pisca);
  } else {
    matriz.mostrar(Tela::OCIOSO, 0, true);
  }
}

// ----------------------------------------------------------------------- Rede: estado e comandos

// O que vai em fechadura/estado (chamado pelo rede.h).
static void preencherEstado(JsonDocument &doc) {
  doc["trava"] = porta.aberta() ? "ABERTA" : "FECHADA";
  doc["porta"] = nomeEstadoPorta(sensor.estado());
  if (sensor.distanciaCm() >= 0) doc["distanciaCm"] = sensor.distanciaCm();
  else doc["distanciaCm"] = nullptr;
  doc["bloqueado"] = bloqueado;
  doc["alarme"] = alarme;
  doc["tempoAberturaMs"] = memoria.tempoAberturaMs;
  doc["limiteCm"] = memoria.limiteFechadaCm;
}

// Comandos do app. Retorna nullptr se deu certo ou o motivo da recusa.
static const char *executarComando(const char *tipo, JsonVariantConst params) {
  if (strcmp(tipo, "ABRIR_PORTA") == 0) {
    liberarPorta(Origem::APP, "");
    return nullptr;
  }
  if (strcmp(tipo, "FECHAR_PORTA") == 0) {
    porta.fechar();  // o porta.atualizar() agenda a conferência do sensor
    return nullptr;
  }
  if (strcmp(tipo, "DESLIGAR_ALARME") == 0) {
    desligarAlarme(Origem::APP, "");
    return nullptr;
  }
  if (strcmp(tipo, "TESTAR_BUZZER") == 0) {
    buzzer.bipar(3, 200, 150);
    return nullptr;
  }
  if (strcmp(tipo, "ENVIAR_ESTADO") == 0) return nullptr;  // o rede.h publica o estado logo depois
  if (strcmp(tipo, "DEFINIR_SENHA") == 0) {
    int slot = params["slot"] | 0;
    const char *nome = params["nome"] | "";
    const char *senha = params["senha"] | "";
    const char *erro = senhaDefinir(slot, nome, senha);
    if (!erro) registrarEvento(TipoEvento::SENHA_ALTERADA, Origem::APP, nome);
    return erro;
  }
  if (strcmp(tipo, "REMOVER_SENHA") == 0) {
    int slot = params["slot"] | 0;
    char nome[NOME_MAX + 1] = "";
    if (slot >= 1 && slot <= NUM_SENHAS) strncpy(nome, memoria.slots[slot - 1].nome, NOME_MAX);
    const char *erro = senhaRemover(slot);
    if (!erro) registrarEvento(TipoEvento::SENHA_ALTERADA, Origem::APP, nome);
    return erro;
  }
  if (strcmp(tipo, "DEFINIR_CONFIG") == 0) {
    unsigned long abertura = params["tempoAberturaMs"] | memoria.tempoAberturaMs;
    int limite = params["limiteCm"] | (int)memoria.limiteFechadaCm;
    if (abertura < TEMPO_ABERTURA_MIN_MS || abertura > TEMPO_ABERTURA_MAX_MS) return "TEMPO_INVALIDO";
    if (limite < LIMITE_MIN_CM || limite > LIMITE_MAX_CM) return "LIMITE_INVALIDO";
    memoria.tempoAberturaMs = abertura;
    memoria.limiteFechadaCm = (uint16_t)limite;
    sensor.definirLimite((uint16_t)limite);
    memoriaSalvar();
    return nullptr;
  }
  return "COMANDO_DESCONHECIDO";
}

// ----------------------------------------------------------------------- Diagnóstico pelo Serial
// 's' = estado; 'u' = 5 leituras do ultrassônico; 't' = testa LED, buzzer, matriz e servo;
// 'k' = liga/desliga o eco das teclas (para conferir a ligação do teclado).
static void lerSerial() {
  if (!Serial.available()) return;
  char c = Serial.read();
  if (c == 's') {
    Serial.print("[status] trava=");
    Serial.print(porta.aberta() ? "ABERTA" : "FECHADA");
    Serial.print(" porta=");
    Serial.print(nomeEstadoPorta(sensor.estado()));
    Serial.print(" cm=");
    Serial.print(sensor.distanciaCm());
    Serial.print(" bloqueado=");
    Serial.print(bloqueado);
    Serial.print(" alarme=");
    Serial.print(alarme);
    Serial.print(" wifi=");
    Serial.print(wifiConectado);
    Serial.print(" mqtt=");
    Serial.print(mqttConectado());
    Serial.print(" fila=");
    Serial.println(filaQuantidade);
  } else if (c == 'k') {
    ecoTeclas = !ecoTeclas;
    Serial.println(ecoTeclas ? "[diag] eco das teclas LIGADO (a senha aparece!)" : "[diag] eco das teclas desligado");
  } else if (c == 't') {
    // Só diagnóstico: aqui o delay() é aceitável (ninguém está usando a fechadura).
    Serial.println("[diag] LED aceso 1 s");
    digitalWrite(PINO_LED, HIGH);
    delay(1000);
    digitalWrite(PINO_LED, LOW);
    Serial.println("[diag] buzzer: 2 bipes");
    for (int i = 0; i < 2; i++) {
      digitalWrite(PINO_BUZZER, HIGH);
      delay(200);
      digitalWrite(PINO_BUZZER, LOW);
      delay(200);
    }
    Serial.println("[diag] matriz: todos os icones");
    const Tela telas[] = {Tela::OCIOSO, Tela::LIBERADO, Tela::NEGADO, Tela::BLOQUEADO, Tela::NAO_FECHOU, Tela::ALARME};
    for (Tela t : telas) {
      matriz.mostrar(t, 30, true);
      delay(700);
    }
    Serial.println("[diag] servo: 90 graus por 1,5 s e volta a 0");
    porta.abrir(1500);
  } else if (c == 'u') {
    for (int i = 0; i < 5; i++) {
      int cm = sensor.medir();
      Serial.print("[ultrassom] ");
      if (cm == SensorPorta::SEM_ECO) Serial.println("sem eco (ECHO nao subiu)");
      else if (cm == SensorPorta::LONGE) Serial.println("longe (> 2 m)");
      else {
        Serial.print(cm);
        Serial.println(" cm");
      }
      delay(60);  // só no diagnóstico manual
    }
  }
}

// ----------------------------------------------------------------------- setup / loop

void setup() {
  Serial.begin(115200);
  delay(300);
  Serial.println("\n=== Fechadura Inteligente (Uno R4 WiFi) ===");

  memoriaCarregar();
  pinMode(PINO_BOTAO_SAIDA, INPUT_PULLUP);
  buzzer.iniciar();
  led.iniciar();
  matriz.iniciar();
  porta.iniciar();
  sensor.iniciar(memoria.limiteFechadaCm);
  teclado.iniciar();
  redeIniciar(memoria.boots);

  Serial.println("Pronto. Serial: s = status, u = ultrassom, t = testa atuadores, k = eco do teclado");
}

void loop() {
  unsigned long agora = millis();

  // 1) Entradas: teclado, botão de saída e sensor da porta
  char tecla = teclado.ler(agora);
  if (tecla) tratarTecla(tecla);
  lerBotaoSaida(agora);

  EstadoPorta antes = sensor.estado();
  if (sensor.atualizar(agora)) portaMudou(antes, sensor.estado());

  // 2) Tempos: digitação parada, fim do bloqueio, servo voltando, conferir se fechou
  if ((quantidadeDigitada > 0 || modoSaida || passouDoLimite) && agora - ultimaTecla >= DIGITACAO_EXPIRA_MS) {
    limparDigitacao();
  }
  if (bloqueado) {
    if ((long)(agora - fimDoBloqueio) >= 0) {
      encerrarBloqueio();
    } else if (agora - ultimoBipeBloqueio >= 1000) {  // bipe a cada segundo durante o bloqueio
      ultimoBipeBloqueio = agora;
      buzzer.bipar(1, 150);
    }
  }
  if (porta.atualizar(agora)) {  // o servo acabou de voltar para 0°
    conferirFechamentoEm = agora + VERIFICAR_FECHAMENTO_MS;
    pedirEnvioDoEstado();
  }
  if (conferirFechamentoEm && (long)(agora - conferirFechamentoEm) >= 0) {
    conferirFechamentoEm = 0;
    conferirSeFechou();
  }

  // 3) Saídas: buzzer, LED e matriz
  buzzer.atualizar(agora);
  atualizarIndicadores(agora);

  // 4) Rede (só tenta conectar quando ninguém está usando a fechadura)
  bool ocioso = quantidadeDigitada == 0 && !modoSaida && agora - ultimaTecla > 3000 && !porta.aberta() &&
                !porta.movendo();
  redeAtualizar(agora, ocioso);

  lerSerial();
}
