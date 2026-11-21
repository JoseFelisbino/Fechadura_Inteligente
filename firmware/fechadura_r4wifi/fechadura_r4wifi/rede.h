#pragma once
// =============================================================================
// rede.h — Wi-Fi (WiFiS3), MQTT, fila de eventos offline e horário (NTP)
//
// A fechadura NUNCA depende da rede: se o Wi-Fi ou o broker caírem, os eventos ficam numa fila
// em RAM (os últimos TAMANHO_FILA) e são enviados quando a conexão voltar.
//
// Tópicos:
//   fechadura/eventos            -> { id, tipo, origem, usuario?, timestamp? }   (QoS 1)
//   fechadura/estado             -> estado completo a cada 2 s                   (QoS 0)
//   fechadura/status             -> { online } com retain; o broker publica { online:false } (LWT)
//   fechadura/comandos           <- { id, tipo, params? }  (o Arduino assina)
//   fechadura/comandos/resposta  -> { id, ok, motivo? }
// =============================================================================

#include <Arduino.h>
#include <ArduinoJson.h>
#include <MQTT.h>
#include <WiFiS3.h>
#include "config.h"
#include "secrets.h"

#define TOPICO_EVENTOS "fechadura/eventos"
#define TOPICO_ESTADO "fechadura/estado"
#define TOPICO_STATUS "fechadura/status"
#define TOPICO_COMANDOS "fechadura/comandos"
#define TOPICO_RESPOSTA "fechadura/comandos/resposta"

// ----------------------------------------------------------------------- Tipos de evento
enum class TipoEvento : uint8_t {
  ACESSO_LIBERADO, SENHA_INCORRETA, BLOQUEIO_INICIO, BLOQUEIO_FIM, PORTA_ABERTA,
  PORTA_FECHADA, PORTA_NAO_FECHOU, PORTA_FORCADA, ALARME_DESLIGADO, SENHA_ALTERADA,
};
static const char *const NOMES_EVENTO[] = {
    "ACESSO_LIBERADO", "SENHA_INCORRETA", "BLOQUEIO_INICIO", "BLOQUEIO_FIM", "PORTA_ABERTA",
    "PORTA_FECHADA", "PORTA_NAO_FECHOU", "PORTA_FORCADA", "ALARME_DESLIGADO", "SENHA_ALTERADA",
};

// Quem causou o evento. TECLADO = entrada com senha; TECLADO_SAIDA = 'D' + senha + '#'.
enum class Origem : uint8_t { TECLADO, TECLADO_SAIDA, BOTAO_SAIDA, APP, SENSOR, SISTEMA };
static const char *const NOMES_ORIGEM[] = {"TECLADO", "TECLADO_SAIDA", "BOTAO_SAIDA", "APP", "SENSOR", "SISTEMA"};

// Implementadas no .ino: o que vai no estado e o que fazer com cada comando do app.
static void preencherEstado(JsonDocument &doc);
static const char *executarComando(const char *tipo, JsonVariantConst params);  // nullptr = ok

// ----------------------------------------------------------------------- Fila de eventos
struct Evento {
  uint32_t numero;              // sequência desde o boot (o id final é DEVICE_ID-boot-numero)
  TipoEvento tipo;
  Origem origem;
  char usuario[NOME_MAX + 1];
  unsigned long millisOcorrido; // vira horário real quando o NTP estiver disponível
};

static Evento fila[TAMANHO_FILA];
static uint8_t filaInicio = 0, filaQuantidade = 0;
static uint32_t numeroEvento = 0;
static uint32_t bootAtual = 0;

// Registra um evento. Se a fila estiver cheia, o mais antigo é descartado.
static void registrarEvento(TipoEvento tipo, Origem origem, const char *usuario = "") {
  if (filaQuantidade == TAMANHO_FILA) {
    filaInicio = (filaInicio + 1) % TAMANHO_FILA;
    filaQuantidade--;
    Serial.println("[fila] cheia: evento mais antigo descartado");
  }
  Evento &e = fila[(filaInicio + filaQuantidade) % TAMANHO_FILA];
  e.numero = ++numeroEvento;
  e.tipo = tipo;
  e.origem = origem;
  strncpy(e.usuario, usuario ? usuario : "", NOME_MAX);
  e.usuario[NOME_MAX] = '\0';
  e.millisOcorrido = millis();
  filaQuantidade++;
  Serial.print("[evento] ");
  Serial.print(NOMES_EVENTO[(uint8_t)tipo]);
  Serial.print(" / ");
  Serial.print(NOMES_ORIGEM[(uint8_t)origem]);
  if (e.usuario[0]) {
    Serial.print(" / ");
    Serial.print(e.usuario);
  }
  Serial.println();
}

// ----------------------------------------------------------------------- Horário
static bool relogioValido = false;
static unsigned long epochSincronizado = 0;  // segundos desde 1970 no momento do NTP
static unsigned long millisSincronizado = 0;
static unsigned long ultimaTentativaNtp = 0;

static void atualizarRelogio(unsigned long agora) {
  if (relogioValido || agora - ultimaTentativaNtp < INTERVALO_NTP_MS) return;
  ultimaTentativaNtp = agora;
  unsigned long epoch = WiFi.getTime();  // NTP feito pelo módulo Wi-Fi; 0 = ainda não tem
  if (epoch > 1735689600UL) {             // depois de 01/01/2025 = horário plausível
    epochSincronizado = epoch;
    millisSincronizado = millis();
    relogioValido = true;
    Serial.println("[ntp] horario sincronizado");
  }
}

// Horário do evento em milissegundos desde 1970 (funciona até para eventos de antes do NTP).
static double horarioDoEvento(const Evento &e) {
  long diferencaMs = (long)(e.millisOcorrido - millisSincronizado);
  return (double)epochSincronizado * 1000.0 + (double)diferencaMs;
}

// ----------------------------------------------------------------------- Wi-Fi + MQTT
static WiFiClient clienteWifi;
static MQTTClient mqtt(BUFFER_MQTT);
static const bool redeHabilitada = strcmp(WIFI_SSID, "minha-rede") != 0;
static bool wifiConectado = false;
static bool primeiraTentativa = true;
static unsigned long ultimaTentativaWifi = 0, ultimaChecagemWifi = 0, ultimaTentativaMqtt = 0;
static unsigned long ultimoEstado = 0;
static bool estadoPendente = false;

// Comandos chegam dentro do mqtt.loop(); só copiamos aqui e executamos depois.
static char comandos[2][BUFFER_MQTT];
static uint8_t comandosPendentes = 0;
static char idsRecentes[8][40];  // para ignorar comando com id repetido
static uint8_t proximoId = 0;

static bool mqttConectado() { return wifiConectado && mqtt.connected(); }
static void pedirEnvioDoEstado() { estadoPendente = true; }

static void aoReceberMensagem(MQTTClient *, char topico[], char dados[], int tamanho) {
  if (strcmp(topico, TOPICO_COMANDOS) != 0 || tamanho <= 0 || tamanho >= BUFFER_MQTT || comandosPendentes >= 2) return;
  memcpy(comandos[comandosPendentes], dados, tamanho);
  comandos[comandosPendentes][tamanho] = '\0';
  comandosPendentes++;
}

static void publicarEstado() {
  JsonDocument doc;
  preencherEstado(doc);
  doc["online"] = true;
  char texto[256];
  serializeJson(doc, texto, sizeof(texto));
  mqtt.publish(TOPICO_ESTADO, texto, false, 0);
}

static void responderComando(const char *id, const char *motivo) {
  JsonDocument doc;
  doc["id"] = id;
  doc["ok"] = motivo == nullptr;
  if (motivo) doc["motivo"] = motivo;
  char texto[128];
  serializeJson(doc, texto, sizeof(texto));
  mqtt.publish(TOPICO_RESPOSTA, texto, false, 1);
}

static void processarComando(char *texto) {
  JsonDocument doc;
  if (deserializeJson(doc, texto)) {
    Serial.println("[cmd] JSON invalido");
    return;
  }
  const char *id = doc["id"] | "";
  const char *tipo = doc["tipo"] | "";
  if (!id[0] || strlen(id) >= sizeof(idsRecentes[0])) return;
  for (auto &recente : idsRecentes) {
    if (strcmp(recente, id) == 0) {
      Serial.println("[cmd] id repetido: ignorado");
      return;
    }
  }
  strcpy(idsRecentes[proximoId], id);
  proximoId = (proximoId + 1) % 8;

  Serial.print("[cmd] ");
  Serial.println(tipo);
  const char *motivo = executarComando(tipo, doc["params"]);
  responderComando(id, motivo);
  pedirEnvioDoEstado();
}

// Envia o evento mais antigo da fila. Só tira da fila se o broker confirmou (PUBACK).
static void enviarProximoEvento() {
  if (filaQuantidade == 0) return;
  const Evento &e = fila[filaInicio];
  JsonDocument doc;
  char id[48];
  snprintf(id, sizeof(id), "%s-%lu-%lu", DEVICE_ID, (unsigned long)bootAtual, (unsigned long)e.numero);
  doc["id"] = id;
  doc["tipo"] = NOMES_EVENTO[(uint8_t)e.tipo];
  doc["origem"] = NOMES_ORIGEM[(uint8_t)e.origem];
  if (e.usuario[0]) doc["usuario"] = e.usuario;
  if (relogioValido) doc["timestamp"] = (uint64_t)horarioDoEvento(e);  // sem NTP: o backend usa a hora de recebimento
  char texto[200];
  serializeJson(doc, texto, sizeof(texto));
  if (mqtt.publish(TOPICO_EVENTOS, texto, false, 1)) {
    filaInicio = (filaInicio + 1) % TAMANHO_FILA;
    filaQuantidade--;
  }
}

static void conectarMqtt() {
  unsigned long t0 = millis();
  bool ok = strlen(MQTT_USER) > 0 ? mqtt.connect(DEVICE_ID, MQTT_USER, MQTT_PASSWORD) : mqtt.connect(DEVICE_ID);
  Serial.print("[mqtt] conexao ");
  Serial.print(ok ? "OK" : "falhou");
  Serial.print(" (");
  Serial.print(millis() - t0);
  Serial.println(" ms)");
  if (!ok) return;
  mqtt.publish(TOPICO_STATUS, "{\"online\":true}", true, 1);
  mqtt.subscribe(TOPICO_COMANDOS, 1);
  pedirEnvioDoEstado();
}

static void redeIniciar(uint32_t boot) {
  bootAtual = boot;
  mqtt.begin(MQTT_HOST, MQTT_PORT, clienteWifi);
  mqtt.setKeepAlive(10);
  mqtt.setCleanSession(true);  // comandos antigos não são reentregues ao reconectar
  mqtt.setTimeout(1000);
  // Testamento (LWT): se o Arduino sumir, o próprio broker avisa que ele ficou offline.
  mqtt.setWill(TOPICO_STATUS, "{\"online\":false}", true, 1);
  mqtt.onMessageAdvanced(aoReceberMensagem);
  if (!redeHabilitada) Serial.println("[rede] secrets.h de exemplo: rede desligada (modo local)");
}

// Chamado em todo loop. "podeTravar" = ninguém digitando e porta parada: só então tentamos
// WiFi.begin() e mqtt.connect(), que seguram o loop por alguns segundos.
static void redeAtualizar(unsigned long agora, bool podeTravar) {
  if (!redeHabilitada) return;

  if (agora - ultimaChecagemWifi >= 2000) {
    ultimaChecagemWifi = agora;
    bool conectado = WiFi.status() == WL_CONNECTED;
    if (conectado != wifiConectado) Serial.println(conectado ? "[wifi] conectado" : "[wifi] desconectado");
    wifiConectado = conectado;
  }

  if (!wifiConectado) {
    if ((primeiraTentativa || agora - ultimaTentativaWifi >= INTERVALO_WIFI_MS) && podeTravar) {
      primeiraTentativa = false;
      ultimaTentativaWifi = agora;
      unsigned long t0 = millis();
      WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
      Serial.print("[wifi] tentativa de conexao (");
      Serial.print(millis() - t0);
      Serial.println(" ms)");
      ultimaChecagemWifi = 0;
    }
    return;
  }

  atualizarRelogio(agora);

  if (!mqtt.connected()) {
    if (agora - ultimaTentativaMqtt >= INTERVALO_MQTT_MS && podeTravar) {
      ultimaTentativaMqtt = agora;
      conectarMqtt();
    }
    return;
  }

  mqtt.loop();
  for (uint8_t i = 0; i < comandosPendentes; i++) processarComando(comandos[i]);
  comandosPendentes = 0;

  enviarProximoEvento();

  if (estadoPendente || agora - ultimoEstado >= INTERVALO_ESTADO_MS) {
    estadoPendente = false;
    ultimoEstado = agora;
    publicarEstado();
  }
}
