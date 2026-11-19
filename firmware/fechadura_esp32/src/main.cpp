// Fechadura inteligente — ESP32
//
// Responsabilidades locais (funcionam sem internet nem servidor):
//   * ler a senha no teclado 4x4 e validar contra o hash salvo na NVS;
//   * acionar o relé da trava por tempo limitado;
//   * bloquear após 3 senhas incorretas consecutivas e tocar o buzzer;
//   * ler os sensores magnéticos de portas/janelas.
//
// Comunicação (tarefa separada, núcleo 0): Wi-Fi + MQTT, heartbeat e fila local
// de eventos reenviados ao reconectar. Nenhuma mensagem recebida da rede aciona a trava,
// e a senha digitada nunca sai do microcontrolador.

#include <Arduino.h>
#include <ArduinoJson.h>
#include <Keypad.h>
#include <MQTT.h>
#include <Preferences.h>
#include <WiFi.h>
#include <sys/time.h>
#include <time.h>

#include "config.h"
#include "event_queue.h"
#include "pin_store.h"
#include "secrets.h"

#ifdef MQTT_USE_TLS
#include <WiFiClientSecure.h>
static WiFiClientSecure netClient;
#else
static WiFiClient netClient;
#endif

// ======================================================================= Estado global

static char keys[KEYPAD_ROWS][KEYPAD_COLS] = {
    {'1', '2', '3', 'A'},
    {'4', '5', '6', 'B'},
    {'7', '8', '9', 'C'},
    {'*', '0', '#', 'D'},
};
static Keypad keypad = Keypad(makeKeymap(keys), (byte *)KEYPAD_ROW_PINS, (byte *)KEYPAD_COL_PINS, KEYPAD_ROWS, KEYPAD_COLS);

static Preferences prefs;
static PinStore pinStore;
static EventQueue eventQueue;
static MQTTClient mqtt(EVENT_PAYLOAD_MAX + 64);

static uint32_t bootCount = 0;
static uint32_t eventSeq = 0;

static const size_t SENSOR_COUNT = sizeof(SENSORS) / sizeof(SENSORS[0]);
struct SensorState {
  bool open;
  bool lastRaw;
  unsigned long changedAt;
};
static SensorState sensorStates[MAX_SENSORS];

// Fechadura
enum class Mode { Normal, ChangeCurrent, ChangeNew, ChangeConfirm };
static Mode mode = Mode::Normal;
static char input[PIN_MAX_LEN + 2];
static size_t inputLen = 0;
static bool inputOverflow = false;
static char newPin[PIN_MAX_LEN + 1];
static unsigned long lastKeyAt = 0;

static uint8_t failedAttempts = 0;
static bool lockedOut = false;
static unsigned long lockoutStartedAt = 0;

static bool relayOn = false;
static unsigned long relayOnAt = 0;

static unsigned long buzzerUntil = 0;

// Sinalização entre as tarefas
static volatile bool snapshotRequested = false;

// ======================================================================= Utilidades

static bool timeIsValid() { return time(nullptr) > 1700000000; }

// Horário ISO-8601 em UTC (somente quando sincronizado via NTP).
static bool isoNow(char *buf, size_t len) {
  if (!timeIsValid()) return false;
  struct timeval tv;
  gettimeofday(&tv, nullptr);
  struct tm tmUtc;
  gmtime_r(&tv.tv_sec, &tmUtc);
  size_t n = strftime(buf, len, "%Y-%m-%dT%H:%M:%S", &tmUtc);
  snprintf(buf + n, len - n, ".%03ldZ", (long)(tv.tv_usec / 1000));
  return true;
}

// Identificador único por dispositivo: <boot>-<sequência>.
static void nextEventId(char *buf, size_t len) { snprintf(buf, len, "%lu-%lu", (unsigned long)bootCount, (unsigned long)++eventSeq); }

static void enqueue(EventChannel channel, JsonDocument &doc) {
  char payload[EVENT_PAYLOAD_MAX];
  size_t n = serializeJson(doc, payload, sizeof(payload));
  if (n == 0 || n >= sizeof(payload)) {
    Serial.println(F("[evt] payload muito grande, descartado"));
    return;
  }
  eventQueue.push(channel, payload);
}

// Eventos da fechadura. NUNCA incluir a senha digitada.
static void emitAccess(const char *eventType, const char *direction, JsonDocument *metadata = nullptr) {
  JsonDocument doc;
  char id[32], ts[32];
  nextEventId(id, sizeof(id));
  doc["eventId"] = id;
  doc["deviceId"] = DEVICE_ID;
  doc["eventType"] = eventType;
  doc["direction"] = direction;
  if (isoNow(ts, sizeof(ts))) doc["occurredAt"] = ts;
  if (metadata) doc["metadata"] = *metadata;
  enqueue(EventChannel::Access, doc);
  Serial.printf("[lock] %s\n", eventType);
}

static void emitSensor(size_t index) {
  JsonDocument doc;
  char id[32], ts[32];
  nextEventId(id, sizeof(id));
  doc["eventId"] = id;
  doc["deviceId"] = DEVICE_ID;
  doc["pointId"] = SENSORS[index].pointId;
  doc["eventType"] = "SENSOR_STATE_CHANGED";
  doc["state"] = sensorStates[index].open ? "OPEN" : "CLOSED";
  if (isoNow(ts, sizeof(ts))) doc["occurredAt"] = ts;
  enqueue(EventChannel::Sensor, doc);
  Serial.printf("[sensor] GPIO %d -> %s\n", SENSORS[index].pin, sensorStates[index].open ? "ABERTO" : "FECHADO");
}

// ======================================================================= Atuadores

static void setRelay(bool on) {
  digitalWrite(RELAY_PIN, on ? RELAY_ACTIVE_LEVEL : !RELAY_ACTIVE_LEVEL);
  relayOn = on;
  if (on) relayOnAt = millis();
}

static void beep(unsigned long ms) {
  digitalWrite(BUZZER_PIN, HIGH);
  buzzerUntil = millis() + ms;
}

static void releaseLock(const char *direction, const char *source) {
  unsigned long pulse = RELAY_PULSE_MS > RELAY_MAX_MS ? RELAY_MAX_MS : RELAY_PULSE_MS;
  JsonDocument meta;
  meta["source"] = source;
  emitAccess("ACCESS_GRANTED", direction, &meta);
  setRelay(true);
  JsonDocument relMeta;
  relMeta["pulseMs"] = pulse;
  emitAccess("LOCK_RELEASED", direction, &relMeta);
  beep(150);
}

// ======================================================================= Política de tentativas

static void persistAttempts() {
  prefs.putUChar("fails", failedAttempts);
  prefs.putBool("lockout", lockedOut);
}

static void startLockout() {
  lockedOut = true;
  lockoutStartedAt = millis();
  persistAttempts();
  beep(BUZZER_ALARM_MS);
  JsonDocument meta;
  meta["failedAttempts"] = failedAttempts;
  meta["lockoutSeconds"] = LOCKOUT_MS / 1000;
  emitAccess("LOCKOUT_STARTED", "UNKNOWN", &meta);
}

static void registerFailure() {
  failedAttempts++;
  JsonDocument meta;
  meta["attempt"] = failedAttempts;
  emitAccess("ACCESS_DENIED", "UNKNOWN", &meta);
  if (failedAttempts >= MAX_FAILED_ATTEMPTS) {
    startLockout();
  } else {
    persistAttempts();
    beep(400);
  }
}

static void registerSuccess() {
  // Política: um acesso válido zera o contador de tentativas incorretas.
  failedAttempts = 0;
  persistAttempts();
}

static void updateLockout() {
  if (lockedOut && millis() - lockoutStartedAt >= LOCKOUT_MS) {
    // Política: fim do bloqueio zera o contador.
    lockedOut = false;
    failedAttempts = 0;
    persistAttempts();
    emitAccess("LOCKOUT_ENDED", "UNKNOWN");
  }
}

// ======================================================================= Teclado

static void clearInput() {
  memset(input, 0, sizeof(input));
  inputLen = 0;
  inputOverflow = false;
}

static void resetMode() {
  mode = Mode::Normal;
  memset(newPin, 0, sizeof(newPin));
  clearInput();
}

static void handleSubmit() {
  const bool validFormat = !inputOverflow && PinStore::isValidPin(input);

  switch (mode) {
    case Mode::Normal:
      if (validFormat && pinStore.verify(input)) {
        registerSuccess();
        releaseLock("UNKNOWN", "KEYPAD");  // o teclado não determina a direção
      } else {
        registerFailure();
      }
      resetMode();
      break;

    case Mode::ChangeCurrent:
      if (validFormat && pinStore.verify(input)) {
        registerSuccess();
        mode = Mode::ChangeNew;
        clearInput();
        beep(80);
      } else {
        registerFailure();
        resetMode();
      }
      break;

    case Mode::ChangeNew:
      if (validFormat) {
        strlcpy(newPin, input, sizeof(newPin));
        mode = Mode::ChangeConfirm;
        clearInput();
        beep(80);
      } else {
        beep(600);
        resetMode();
      }
      break;

    case Mode::ChangeConfirm:
      if (validFormat && strcmp(newPin, input) == 0) {
        pinStore.setPin(newPin);
        Serial.println(F("[lock] Senha alterada."));
        beep(80);
        delay(120);
        beep(80);
      } else {
        beep(600);
      }
      resetMode();
      break;
  }
}

static void handleKey(char key) {
  lastKeyAt = millis();

  if (lockedOut) {
    beep(60);  // bloqueado: ignora qualquer tecla
    return;
  }

  if (key == '*') {  // limpar / cancelar
    resetMode();
    beep(40);
    return;
  }
  if (key == 'A' && mode == Mode::Normal && inputLen == 0) {  // iniciar troca de senha
    mode = Mode::ChangeCurrent;
    beep(80);
    return;
  }
  if (key == '#') {
    if (inputLen > 0) handleSubmit();
    return;
  }
  if (key >= '0' && key <= '9') {
    if (inputLen < PIN_MAX_LEN) {
      input[inputLen++] = key;
    } else {
      inputOverflow = true;  // senha longa demais conta como incorreta
    }
    beep(20);
  }
}

// ======================================================================= Sensores

static bool readOpen(size_t i) { return digitalRead(SENSORS[i].pin) == HIGH; }

static void setupSensors() {
  for (size_t i = 0; i < SENSOR_COUNT && i < MAX_SENSORS; i++) {
    pinMode(SENSORS[i].pin, INPUT_PULLUP);
    bool open = readOpen(i);
    sensorStates[i] = {open, open, millis()};
  }
}

static void updateSensors() {
  for (size_t i = 0; i < SENSOR_COUNT && i < MAX_SENSORS; i++) {
    bool raw = readOpen(i);
    if (raw != sensorStates[i].lastRaw) {
      sensorStates[i].lastRaw = raw;
      sensorStates[i].changedAt = millis();
    } else if (raw != sensorStates[i].open && millis() - sensorStates[i].changedAt >= SENSOR_DEBOUNCE_MS) {
      sensorStates[i].open = raw;
      emitSensor(i);
    }
  }
  if (snapshotRequested) {
    // Ao reconectar, informa o estado atual de todos os pontos.
    snapshotRequested = false;
    for (size_t i = 0; i < SENSOR_COUNT && i < MAX_SENSORS; i++) emitSensor(i);
  }
}

// ======================================================================= Rede (tarefa no núcleo 0)

static void topicFor(EventChannel channel, char *buf, size_t len) {
  const char *suffix = channel == EventChannel::Access ? "events/access" : channel == EventChannel::Sensor ? "events/sensors" : "status";
  snprintf(buf, len, "home/devices/%s/%s", DEVICE_ID, suffix);
}

static void publishHeartbeat() {
  JsonDocument doc;
  doc["deviceId"] = DEVICE_ID;
  doc["status"] = "ONLINE";
  doc["uptimeMs"] = (uint32_t)millis();
  doc["queued"] = (uint32_t)eventQueue.size();
  doc["rssi"] = WiFi.RSSI();
  doc["firmware"] = FIRMWARE_VERSION;
  char payload[200], topic[96];
  serializeJson(doc, payload, sizeof(payload));
  topicFor(EventChannel::Status, topic, sizeof(topic));
  mqtt.publish(topic, payload, false, 1);
}

static void networkTask(void *) {
  unsigned long lastWifiTry = 0, lastMqttTry = 0, lastHeartbeat = 0;
  bool ntpStarted = false;
  char willTopic[96];
  topicFor(EventChannel::Status, willTopic, sizeof(willTopic));

#ifdef MQTT_USE_TLS
  netClient.setCACert(MQTT_CA_CERT);
#endif
  mqtt.begin(MQTT_HOST, MQTT_PORT, netClient);
  mqtt.setKeepAlive(30);
  mqtt.setTimeout(2000);
  // Testamento: o broker publica OFFLINE se a conexão cair sem aviso.
  mqtt.setWill(willTopic, "{\"status\":\"OFFLINE\"}", false, 1);

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  for (;;) {
    unsigned long now = millis();

    if (WiFi.status() != WL_CONNECTED) {
      if (now - lastWifiTry > WIFI_RECONNECT_MS) {
        lastWifiTry = now;
        WiFi.disconnect();
        WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
      }
      vTaskDelay(pdMS_TO_TICKS(200));
      continue;
    }

    if (!ntpStarted) {
      configTime(0, 0, "pool.ntp.org", "time.google.com");
      ntpStarted = true;
    }

    if (!mqtt.connected()) {
      if (now - lastMqttTry > MQTT_RECONNECT_MS) {
        lastMqttTry = now;
        char clientId[48];
        snprintf(clientId, sizeof(clientId), "lock-%s", DEVICE_ID);
        // Usuário = deviceId, senha = credencial do dispositivo (validada pelo broker + ACL).
        if (mqtt.connect(clientId, DEVICE_ID, DEVICE_KEY)) {
          Serial.println(F("[net] MQTT conectado"));
          publishHeartbeat();
          lastHeartbeat = millis();
          snapshotRequested = true;
        }
      }
      vTaskDelay(pdMS_TO_TICKS(200));
      continue;
    }

    mqtt.loop();

    // Envia a fila (QoS 1): o evento só sai da fila após confirmação do broker.
    QueuedEvent evt;
    if (eventQueue.peek(evt)) {
      char topic[96];
      topicFor(evt.channel, topic, sizeof(topic));
      if (mqtt.publish(topic, evt.payload, false, 1)) {
        eventQueue.pop();
      } else {
        vTaskDelay(pdMS_TO_TICKS(500));
      }
    }

    if (millis() - lastHeartbeat > HEARTBEAT_INTERVAL_MS) {
      publishHeartbeat();
      lastHeartbeat = millis();
    }

    vTaskDelay(pdMS_TO_TICKS(20));
  }
}

// ======================================================================= setup / loop

void setup() {
  // Fail-secure: garante a trava fechada antes de qualquer outra coisa.
  digitalWrite(RELAY_PIN, !RELAY_ACTIVE_LEVEL);
  pinMode(RELAY_PIN, OUTPUT);
  setRelay(false);
  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, LOW);
#if EXIT_BUTTON_PIN >= 0
  pinMode(EXIT_BUTTON_PIN, INPUT_PULLUP);
#endif

  Serial.begin(115200);
  prefs.begin("lock", false);
  bootCount = prefs.getUInt("boot", 0) + 1;
  prefs.putUInt("boot", bootCount);

  pinStore.begin(&prefs, INITIAL_LOCK_PIN);

  // Reiniciar o ESP32 não zera um bloqueio em andamento.
  failedAttempts = prefs.getUChar("fails", 0);
  if (prefs.getBool("lockout", false)) {
    lockedOut = true;
    lockoutStartedAt = millis();
    Serial.println(F("[lock] Bloqueio retomado após reinício."));
  }

  eventQueue.begin();
  setupSensors();
  keypad.setDebounceTime(30);

  xTaskCreatePinnedToCore(networkTask, "network", 8192, nullptr, 1, nullptr, 0);
  Serial.printf("[boot] Fechadura pronta (boot #%lu)\n", (unsigned long)bootCount);
}

void loop() {
  unsigned long now = millis();

  char key = keypad.getKey();
  if (key) handleKey(key);

  if (inputLen > 0 || mode != Mode::Normal) {
    if (now - lastKeyAt > INPUT_TIMEOUT_MS) resetMode();
  }

#if EXIT_BUTTON_PIN >= 0
  static bool exitWasPressed = false;
  bool exitPressed = digitalRead(EXIT_BUTTON_PIN) == LOW;
  if (exitPressed && !exitWasPressed && !relayOn) releaseLock("EXIT", "EXIT_BUTTON");
  exitWasPressed = exitPressed;
#endif

  // Relé: desliga após o pulso e, por segurança, nunca passa de RELAY_MAX_MS.
  if (relayOn) {
    unsigned long elapsed = now - relayOnAt;
    if (elapsed >= RELAY_PULSE_MS || elapsed >= RELAY_MAX_MS) setRelay(false);
  }

  if (buzzerUntil && (long)(now - buzzerUntil) >= 0) {
    digitalWrite(BUZZER_PIN, LOW);
    buzzerUntil = 0;
  }

  updateLockout();
  updateSensors();
  delay(5);
}
