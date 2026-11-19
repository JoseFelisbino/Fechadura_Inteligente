// Fechadura inteligente — Arduino Uno R4 WiFi
//
// Funciona SEM Wi-Fi, broker ou backend:
//   * senha (até 5 slots com nome) + '#' libera o servo da porta principal por UNLOCK_MS;
//   * 3 senhas erradas => bloqueio de 60 s + buzzer (salvo na EEPROM, sobrevive a reinício);
//   * dois HC-SR04 (porta principal e janela) lidos alternadamente;
//   * saída (botão D12, ou 'D' + senha + '#' no teclado) só libera com a janela fechada;
//   * após a saída, a porta fechando arma o alarme; abertura não autorizada dispara a sirene;
//   * matriz de LEDs mostra o estado; LEDs de trava liberada e de alarme.
//
// Rede (tudo no loop, sem RTOS): WiFiS3 + MQTT QoS 1, fila offline com reenvio após o PUBACK,
// heartbeat, testamento OFFLINE e comandos remotos do app (home/devices/{id}/commands).
// O PIN nunca é enviado pelo dispositivo; SET_PIN grava só o hash e apaga o PIN da RAM.

#include <Arduino.h>
#include <ArduinoJson.h>
#include <EEPROM.h>
#include <Keypad.h>
#include <MQTT.h>
#include <RTC.h>
#include <WiFiS3.h>
#include <stdarg.h>

#include "actuators.h"
#include "config.h"
#include "event_queue.h"
#include "matrix_ui.h"
#include "persist.h"
#include "pin_store.h"
#include "secrets.h"
#include "ultrasonic.h"

#ifdef MQTT_USE_TLS
static WiFiSSLClient netClient;
#else
static WiFiClient netClient;
#endif

// ======================================================================= Hardware e estado

static char keys[KEYPAD_ROWS][KEYPAD_COLS] = {
    {'1', '2', '3', 'A'},
    {'4', '5', '6', 'B'},
    {'7', '8', '9', 'C'},
    {'*', '0', '#', 'D'},
};
static Keypad keypad = Keypad(makeKeymap(keys), (byte *)KEYPAD_ROW_PINS, (byte *)KEYPAD_COL_PINS, KEYPAD_ROWS, KEYPAD_COLS);

static PinStore pinStore;
static EventQueue eventQueue;
static LockServos locks;
static Buzzer buzzer;
static MatrixUi ui;
static MQTTClient mqtt(MQTT_BUFFER);

enum SensorIndex : uint8_t { SENSOR_DOOR = 0, SENSOR_WINDOW = 1, SENSOR_COUNT = 2 };
static Ultrasonic sensors[SENSOR_COUNT];
static const char *const SENSOR_POINT_IDS[SENSOR_COUNT] = {DOOR_POINT_ID, WINDOW_POINT_ID};
static uint8_t nextSensor = 0;
static unsigned long lastPingAt = 0;

static uint32_t bootCount = 0;
static uint32_t eventSeq = 0;

// Teclado
enum class InputMode : uint8_t { Entry, Exit };
static InputMode inputMode = InputMode::Entry;
static char input[PIN_MAX_LEN + 2];
static uint8_t inputLen = 0;
static bool inputOverflow = false;
static unsigned long lastKeyAt = 0;

// Bloqueio por senhas erradas
static uint8_t failedAttempts = 0;
static bool lockedOut = false;
static unsigned long lockoutStartedAt = 0;

// Alarme
enum class AlarmState : uint8_t { Disarmed = 0, Armed = 1, Triggered = 2 };
static AlarmState alarmState = AlarmState::Disarmed;
static unsigned long authorizedOpenUntil = 0;  // porta pode abrir sem disparar até aqui
static bool pendingArm = false;                 // saída liberada: arma quando a porta abrir e fechar
static bool pendingArmDoorOpened = false;
static unsigned long pendingArmAt = 0;
static Source pendingArmSource = Source::None;
static int8_t pendingArmSlot = -1;

// Porta aberta tempo demais (aviso local)
static unsigned long doorOpenedAt = 0;
static unsigned long lastDoorWarnBeep = 0;

// Botão de saída
static bool exitButtonRaw = false, exitButtonStable = false;
static unsigned long exitButtonChangedAt = 0;

// Tela temporária (✓, ✗, "feche a janela")
static Screen transientScreen = Screen::Idle;
static unsigned long transientUntil = 0;

// Horário (NTP do módulo Wi-Fi + RTC do R4)
static bool timeValid = false;
static uint32_t epochAtSync = 0;
static unsigned long millisAtSync = 0;
static unsigned long lastNtpTry = 0, lastNtpSync = 0;

// Rede
static bool wifiUp = false;
static bool mqttUp = false;
static unsigned long lastWifiTry = 0, lastWifiCheck = 0, lastMqttTry = 0;
static unsigned long lastMqttLoop = 0, lastPublishAt = 0, lastHeartbeat = 0;
static bool firstWifiTry = true;
static bool snapshotRequested = false;
static char topicAccess[80], topicSensors[80], topicStatus[80], topicCommands[80], topicAck[80];

// Comandos recebidos (copiados no callback, processados no loop)
static char cmdBuf[2][COMMAND_PAYLOAD_MAX + 1];
static uint8_t cmdPending = 0;

enum class AckStatus : uint8_t { Done, Rejected, Expired };
struct AckItem {
  char commandId[40];
  AckStatus status;
  const char *reason;  // literal estático ou nullptr
};
static AckItem ackQueue[ACK_QUEUE_CAPACITY];
static uint8_t ackCount = 0;
static AckItem recentCommands[COMMAND_DEDUP];
static uint8_t recentNext = 0;

// ======================================================================= Log

static void logf(const char *fmt, ...) {
  char buf[160];
  va_list args;
  va_start(args, fmt);
  vsnprintf(buf, sizeof(buf), fmt, args);
  va_end(args);
  Serial.println(buf);
}

// ======================================================================= Horário

static const uint32_t EPOCH_2025 = 1735689600UL;

static void syncClock(uint32_t epoch) {
  epochAtSync = epoch;
  millisAtSync = millis();
  timeValid = true;
}

static uint32_t nowEpoch(uint16_t *msOut = nullptr) {
  if (!timeValid) return 0;
  unsigned long elapsed = millis() - millisAtSync;
  if (msOut) *msOut = elapsed % 1000;
  return epochAtSync + elapsed / 1000;
}

// Dias desde 1970-01-01 <-> data civil (algoritmo de Howard Hinnant).
static int32_t daysFromCivil(int32_t y, uint32_t m, uint32_t d) {
  y -= m <= 2;
  const int32_t era = (y >= 0 ? y : y - 399) / 400;
  const uint32_t yoe = (uint32_t)(y - era * 400);
  const uint32_t doy = (153 * (m + (m > 2 ? -3 : 9)) + 2) / 5 + d - 1;
  const uint32_t doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
  return era * 146097 + (int32_t)doe - 719468;
}

static void civilFromDays(int32_t z, int32_t &y, uint32_t &m, uint32_t &d) {
  z += 719468;
  const int32_t era = (z >= 0 ? z : z - 146096) / 146097;
  const uint32_t doe = (uint32_t)(z - era * 146097);
  const uint32_t yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
  y = (int32_t)yoe + era * 400;
  const uint32_t doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
  const uint32_t mp = (5 * doy + 2) / 153;
  d = doy - (153 * mp + 2) / 5 + 1;
  m = mp < 10 ? mp + 3 : mp - 9;
  y += m <= 2;
}

static void formatIso(uint32_t epoch, uint16_t ms, char *buf, size_t len) {
  int32_t y;
  uint32_t m, d;
  civilFromDays((int32_t)(epoch / 86400UL), y, m, d);
  uint32_t secs = epoch % 86400UL;
  snprintf(buf, len, "%04ld-%02lu-%02luT%02lu:%02lu:%02lu.%03uZ", (long)y, (unsigned long)m, (unsigned long)d,
           (unsigned long)(secs / 3600), (unsigned long)((secs / 60) % 60), (unsigned long)(secs % 60), ms);
}

// Aceita "YYYY-MM-DDTHH:MM:SS[.sss]Z". Retorna 0 se inválido.
static uint32_t parseIso(const char *s) {
  if (!s || strlen(s) < 20) return 0;
  int y, mo, d, h, mi, se;
  if (sscanf(s, "%4d-%2d-%2dT%2d:%2d:%2d", &y, &mo, &d, &h, &mi, &se) != 6) return 0;
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || se > 60) return 0;
  const char *tz = s + 19;
  while (*tz == '.' || (*tz >= '0' && *tz <= '9')) tz++;
  if (*tz != 'Z') return 0;  // o backend sempre envia em UTC (toISOString)
  int32_t days = daysFromCivil(y, (uint32_t)mo, (uint32_t)d);
  return (uint32_t)days * 86400UL + (uint32_t)(h * 3600 + mi * 60 + se);
}

// ======================================================================= Eventos

static QueuedEvent newEvent(EventKind kind) {
  QueuedEvent e = {};
  e.seq = ++eventSeq;
  e.epoch = nowEpoch(&e.ms);
  e.kind = kind;
  e.slot = -1;
  e.lock = LockId::None;
  e.distanceCm = NO_DISTANCE;
  return e;
}

static const char *accessTypeName(AccessType t) {
  switch (t) {
    case AccessType::AccessGranted: return "ACCESS_GRANTED";
    case AccessType::AccessDenied: return "ACCESS_DENIED";
    case AccessType::LockoutStarted: return "LOCKOUT_STARTED";
    case AccessType::LockoutEnded: return "LOCKOUT_ENDED";
    case AccessType::LockReleased: return "LOCK_RELEASED";
    case AccessType::ExitBlocked: return "EXIT_BLOCKED";
    case AccessType::AlarmArmed: return "ALARM_ARMED";
    case AccessType::AlarmDisarmed: return "ALARM_DISARMED";
    case AccessType::AlarmTriggered: return "ALARM_TRIGGERED";
    case AccessType::RemoteUnlock: return "REMOTE_UNLOCK";
    case AccessType::RemoteLock: return "REMOTE_LOCK";
    case AccessType::PinChanged: return "PIN_CHANGED";
  }
  return "UNKNOWN";
}

static const char *directionName(Direction d) {
  return d == Direction::Entry ? "ENTRY" : d == Direction::Exit ? "EXIT" : "UNKNOWN";
}
static const char *sourceName(Source s) {
  switch (s) {
    case Source::Keypad: return "KEYPAD";
    case Source::ExitButton: return "EXIT_BUTTON";
    case Source::App: return "APP";
    case Source::System: return "SYSTEM";
    default: return nullptr;
  }
}
static const char *readingName(Reading r) { return r == Reading::Open ? "OPEN" : r == Reading::Closed ? "CLOSED" : "UNKNOWN"; }
static const char *lockName(LockId l) { return l == LockId::Main ? "MAIN" : "BACK"; }

struct AccessOpts {
  Source source = Source::None;
  int8_t slot = -1;
  LockId lock = LockId::None;
  uint8_t attempt = 0;
  uint8_t pointMask = 0;
  SlotAction slotAction = SlotAction::None;
  uint16_t extra = 0;
};

static void emitAccess(AccessType type, Direction dir, const AccessOpts &o = AccessOpts()) {
  QueuedEvent e = newEvent(EventKind::Access);
  e.type = (uint8_t)type;
  e.value = (uint8_t)dir;
  e.source = o.source;
  e.slot = o.slot;
  e.lock = o.lock;
  e.attempt = o.attempt;
  e.pointMask = o.pointMask;
  e.slotAction = o.slotAction;
  e.extra = o.extra;
  eventQueue.push(e);
  logf("[evt] %s %s", accessTypeName(type), directionName(dir));
}

static void emitSensor(uint8_t idx) {
  QueuedEvent e = newEvent(EventKind::Sensor);
  e.type = idx;
  e.value = (uint8_t)sensors[idx].state();
  e.distanceCm = sensors[idx].distanceCm();
  eventQueue.push(e);
  logf("[sensor] %s -> %s (%u cm)", idx == SENSOR_DOOR ? "porta" : "janela", readingName(sensors[idx].state()),
       e.distanceCm == NO_DISTANCE ? 0 : e.distanceCm);
}

static void addPointIds(JsonArray arr, uint8_t mask) {
  for (uint8_t i = 0; i < SENSOR_COUNT; i++) {
    if (mask & (1 << i)) arr.add(SENSOR_POINT_IDS[i]);
  }
}

// Monta o JSON de um evento da fila. NUNCA contém senha, hash ou chave.
static size_t serializeEvent(const QueuedEvent &e, char *out, size_t len) {
  JsonDocument doc;
  char id[24], ts[32];
  snprintf(id, sizeof(id), "%lu-%lu", (unsigned long)bootCount, (unsigned long)e.seq);
  doc["eventId"] = id;
  doc["deviceId"] = DEVICE_ID;

  if (e.kind == EventKind::Sensor) {
    doc["pointId"] = SENSOR_POINT_IDS[e.type];
    doc["eventType"] = "SENSOR_STATE_CHANGED";
    doc["state"] = readingName((Reading)e.value);
    if (e.distanceCm != NO_DISTANCE) doc["distanceCm"] = e.distanceCm;
  } else {
    AccessType type = (AccessType)e.type;
    doc["eventType"] = accessTypeName(type);
    doc["direction"] = directionName((Direction)e.value);
    JsonObject meta = doc["metadata"].to<JsonObject>();
    if (sourceName(e.source)) meta["source"] = sourceName(e.source);
    if (e.slot >= 0) {
      meta["slot"] = e.slot;
      if (pinStore.name(e.slot)) meta["userLabel"] = pinStore.name(e.slot);
    }
    if (e.lock != LockId::None) meta["lock"] = lockName(e.lock);
    if (type == AccessType::AccessDenied) meta["attempt"] = e.attempt;
    if (type == AccessType::LockoutStarted) {
      meta["failedAttempts"] = e.attempt;
      meta["lockoutSeconds"] = e.extra;
    }
    if (type == AccessType::LockReleased || type == AccessType::RemoteUnlock) meta["pulseMs"] = e.extra;
    if (type == AccessType::ExitBlocked) addPointIds(meta["openPoints"].to<JsonArray>(), e.pointMask);
    if (type == AccessType::AlarmTriggered && e.pointMask) {
      meta["triggerPointId"] = SENSOR_POINT_IDS[(e.pointMask & POINT_DOOR_BIT) ? SENSOR_DOOR : SENSOR_WINDOW];
    }
    if (e.slotAction != SlotAction::None) meta["slotAction"] = e.slotAction == SlotAction::Set ? "SET" : "DELETE";
    if (meta.size() == 0) doc.remove("metadata");
  }

  if (e.epoch) {
    formatIso(e.epoch, e.ms, ts, sizeof(ts));
    doc["occurredAt"] = ts;
  }
  size_t n = serializeJson(doc, out, len);
  return n >= len ? 0 : n;
}

// ======================================================================= Persistência

static void persistAttempts() {
  persist::save(PERSIST_OFFSET(failedAttempts), failedAttempts);
  uint8_t lo = lockedOut ? 1 : 0;
  persist::save(PERSIST_OFFSET(lockedOut), lo);
}

static void persistAlarm() {
  uint8_t s = (uint8_t)alarmState;
  persist::save(PERSIST_OFFSET(alarmState), s);
}

// ======================================================================= Atuadores e telas

static void showTransient(Screen s, unsigned long ms) {
  transientScreen = s;
  transientUntil = millis() + ms;
}

static void clearInput() {
  secureZero(input, sizeof(input));
  inputLen = 0;
  inputOverflow = false;
  inputMode = InputMode::Entry;
}

static void unlock(LockId lock, unsigned long ms) {
  locks.unlock((uint8_t)lock, ms);
  if (lock == LockId::Main) authorizedOpenUntil = millis() + ms + DOOR_OPEN_GRACE_MS;
}

// ======================================================================= Alarme

static void armAlarm(Source source, int8_t slot) {
  if (alarmState != AlarmState::Disarmed) return;
  alarmState = AlarmState::Armed;
  persistAlarm();
  AccessOpts o;
  o.source = source;
  o.slot = slot;
  emitAccess(AccessType::AlarmArmed, Direction::Unknown, o);
  buzzer.beep(2, 60, 80);
}

static void disarmAlarm(Source source, int8_t slot) {
  if (alarmState == AlarmState::Disarmed) return;
  alarmState = AlarmState::Disarmed;
  pendingArm = false;
  persistAlarm();
  buzzer.silence();
  AccessOpts o;
  o.source = source;
  o.slot = slot;
  emitAccess(AccessType::AlarmDisarmed, Direction::Unknown, o);
}

static void triggerAlarm(uint8_t pointBit) {
  if (alarmState != AlarmState::Armed) return;
  alarmState = AlarmState::Triggered;
  persistAlarm();
  buzzer.siren(ALARM_SIREN_MAX_MS);
  AccessOpts o;
  o.source = Source::System;
  o.pointMask = pointBit;
  emitAccess(AccessType::AlarmTriggered, Direction::Unknown, o);
}

// ======================================================================= Fechadura

static void startLockout() {
  lockedOut = true;
  lockoutStartedAt = millis();
  persistAttempts();
  buzzer.beep(1, LOCKOUT_BUZZER_MS);
  AccessOpts o;
  o.source = Source::Keypad;
  o.attempt = failedAttempts;
  o.extra = LOCKOUT_MS / 1000;
  emitAccess(AccessType::LockoutStarted, Direction::Unknown, o);
}

static void registerFailure() {
  failedAttempts++;
  AccessOpts o;
  o.source = Source::Keypad;
  o.attempt = failedAttempts;
  emitAccess(AccessType::AccessDenied, Direction::Unknown, o);
  showTransient(Screen::Denied, 1500);
  if (failedAttempts >= MAX_FAILED_ATTEMPTS) {
    startLockout();
  } else {
    persistAttempts();
    buzzer.beep(1, 400);
  }
}

static void registerSuccess() {
  // Política: um acesso válido zera o contador de tentativas incorretas.
  if (failedAttempts != 0) {
    failedAttempts = 0;
    persistAttempts();
  }
}

static void updateLockout(unsigned long now) {
  if (lockedOut && now - lockoutStartedAt >= LOCKOUT_MS) {
    // Política: o fim do bloqueio zera o contador.
    lockedOut = false;
    failedAttempts = 0;
    persistAttempts();
    AccessOpts o;
    o.source = Source::System;
    emitAccess(AccessType::LockoutEnded, Direction::Unknown, o);
  }
}

static void releaseMain(Direction dir, Source source, int8_t slot) {
  AccessOpts o;
  o.source = source;
  o.slot = slot;
  emitAccess(AccessType::AccessGranted, dir, o);
  unlock(LockId::Main, UNLOCK_MS);
  o.lock = LockId::Main;
  o.extra = UNLOCK_MS;
  emitAccess(AccessType::LockReleased, dir, o);
  showTransient(Screen::Granted, 2000);
  buzzer.beep(1, 150);
}

// Entrada pelo teclado (lado de fora): desarma o alarme e libera a porta principal.
static void handleEntry(int8_t slot) {
  pendingArm = false;
  if (alarmState != AlarmState::Disarmed) disarmAlarm(Source::Keypad, slot);
  releaseMain(Direction::Entry, Source::Keypad, slot);
}

// Saída com checagem: só libera se a janela estiver FECHADA (aberta ou desconhecida bloqueia).
static void handleExit(Source source, int8_t slot) {
  if (sensors[SENSOR_WINDOW].state() != Reading::Closed) {
    AccessOpts o;
    o.source = source;
    o.slot = slot;
    o.pointMask = POINT_WINDOW_BIT;
    emitAccess(AccessType::ExitBlocked, Direction::Exit, o);
    showTransient(Screen::CloseWindow, 4000);
    buzzer.beep(3, 120, 120);
    return;
  }
  releaseMain(Direction::Exit, source, slot);
  if (alarmState == AlarmState::Disarmed) {
    pendingArm = true;
    pendingArmAt = millis();
    pendingArmDoorOpened = sensors[SENSOR_DOOR].state() == Reading::Open;
    pendingArmSource = source;
    pendingArmSlot = slot;
  }
}

static void submitInput() {
  const bool exitMode = inputMode == InputMode::Exit;
  input[inputLen] = '\0';
  int8_t slot = inputOverflow ? -1 : pinStore.verify(input);
  clearInput();
  if (slot < 0) {
    registerFailure();
    return;
  }
  registerSuccess();
  if (exitMode) handleExit(Source::Keypad, slot);
  else handleEntry(slot);
}

// Eco das teclas para calibrar o teclado (comando k no Serial). Desliga ao reiniciar.
static bool keyEcho = false;

static void handleKey(char key) {
  lastKeyAt = millis();
  // Log de teste: nunca imprime o valor dos dígitos.
  if (keyEcho) logf("[key] %c (eco de calibracao ligado)", key);
  else if (key >= '0' && key <= '9') logf("[key] digito");
  else logf("[key] %c", key);
  if (lockedOut) {
    buzzer.beep(1, 60);  // bloqueado: nenhuma tecla é aceita, nem a senha correta
    return;
  }
  if (key == '*') {
    clearInput();
    buzzer.beep(1, 40);
    return;
  }
  if (key == 'D' && inputLen == 0 && inputMode == InputMode::Entry) {
    inputMode = InputMode::Exit;  // saída pelo teclado: D + senha + #
    buzzer.beep(2, 40, 60);
    return;
  }
  if (key == '#') {
    if (inputLen > 0) submitInput();
    return;
  }
  if (key >= '0' && key <= '9') {
    if (inputLen < PIN_MAX_LEN) input[inputLen++] = key;
    else inputOverflow = true;  // senha longa demais conta como incorreta
    buzzer.beep(1, 20);
  }
}

static void updateExitButton(unsigned long now) {
  bool pressed = digitalRead(EXIT_BUTTON_PIN) == LOW;
  if (pressed != exitButtonRaw) {
    exitButtonRaw = pressed;
    exitButtonChangedAt = now;
  } else if (pressed != exitButtonStable && now - exitButtonChangedAt >= 50) {
    exitButtonStable = pressed;
    // O botão fica do lado de dentro: funciona inclusive durante o bloqueio do teclado.
    if (pressed && !locks.isUnlocked((uint8_t)LockId::Main)) handleExit(Source::ExitButton, -1);
  }
}

// ======================================================================= Sensores

static void onSensorChanged(uint8_t idx, unsigned long now) {
  emitSensor(idx);
  Reading r = sensors[idx].state();
  if (idx == SENSOR_DOOR) {
    if (r == Reading::Open) {
      doorOpenedAt = now;
      lastDoorWarnBeep = 0;
      if (pendingArm) pendingArmDoorOpened = true;
      if (alarmState == AlarmState::Armed && (long)(now - authorizedOpenUntil) >= 0) triggerAlarm(POINT_DOOR_BIT);
    } else if (r == Reading::Closed && pendingArm && pendingArmDoorOpened) {
      pendingArm = false;
      armAlarm(pendingArmSource, pendingArmSlot);
    }
  } else if (idx == SENSOR_WINDOW) {
    // Janela "desconhecida" com alarme armado não dispara (decisão do grupo): só gera o evento.
    if (r == Reading::Open && alarmState == AlarmState::Armed) triggerAlarm(POINT_WINDOW_BIT);
  }
}

static void updateSensors(unsigned long now) {
  if (now - lastPingAt < ULTRA_INTERVAL_MS) return;
  lastPingAt = now;
  uint8_t idx = nextSensor;
  nextSensor = (nextSensor + 1) % SENSOR_COUNT;
  if (sensors[idx].ping()) onSensorChanged(idx, millis());
}

static void updateAlarmTimers(unsigned long now) {
  if (pendingArm && now - pendingArmAt > EXIT_ARM_WINDOW_MS) {
    pendingArm = false;  // saiu e a porta não abriu/fechou no prazo: não arma
    logf("[alarm] armamento cancelado (prazo de saída esgotado)");
  }
  bool doorOpen = sensors[SENSOR_DOOR].state() == Reading::Open;
  if (doorOpen && alarmState != AlarmState::Triggered && now - doorOpenedAt >= DOOR_OPEN_WARN_MS) {
    if (lastDoorWarnBeep == 0 || now - lastDoorWarnBeep >= DOOR_OPEN_WARN_REPEAT_MS) {
      lastDoorWarnBeep = now;
      buzzer.beep(2, 80, 120);
    }
  }
}

// ======================================================================= Saídas visuais

static bool doorOpenTooLong(unsigned long now) {
  return sensors[SENSOR_DOOR].state() == Reading::Open && now - doorOpenedAt >= DOOR_OPEN_WARN_MS;
}

static void updateIndicators(unsigned long now) {
  digitalWrite(LED_UNLOCKED_PIN, locks.anyUnlocked() ? HIGH : LOW);

  bool alarmLed = false;
  if (alarmState == AlarmState::Armed) alarmLed = true;
  else if (alarmState == AlarmState::Triggered) alarmLed = (now / 200) % 2;
  else if (pendingArm) alarmLed = (now / 500) % 2;
  digitalWrite(LED_ALARM_PIN, alarmLed ? HIGH : LOW);

  bool blinkSlow = (now / 500) % 2;
  bool blinkFast = (now / 250) % 2;
  if (alarmState == AlarmState::Triggered) {
    ui.show(Screen::Alarm, 0, blinkFast);
  } else if (lockedOut) {
    unsigned long left = LOCKOUT_MS - (now - lockoutStartedAt);
    ui.show(Screen::Lockout, (uint8_t)((left + 999) / 1000), true);
  } else if ((long)(transientUntil - now) > 0) {
    ui.show(transientScreen, 0, transientScreen == Screen::CloseWindow ? blinkFast : true);
  } else if (inputMode == InputMode::Exit) {
    ui.show(Screen::ExitTyping, inputLen, true);
  } else if (inputLen > 0) {
    ui.show(Screen::Typing, inputLen, true);
  } else if (doorOpenTooLong(now)) {
    ui.show(Screen::DoorOpenWarn, 0, blinkSlow);
  } else if (alarmState == AlarmState::Armed) {
    ui.show(Screen::Armed, 0, true);
  } else if (pendingArm) {
    ui.show(Screen::Arming, 0, blinkSlow);
  } else {
    ui.show(Screen::Idle, 0, true);
  }
}

// ======================================================================= Comandos remotos

static void queueAck(const char *commandId, AckStatus status, const char *reason) {
  // Lembra o resultado para responder igual se o mesmo commandId chegar de novo.
  AckItem item = {};
  strncpy(item.commandId, commandId, sizeof(item.commandId) - 1);
  item.status = status;
  item.reason = reason;
  recentCommands[recentNext] = item;
  recentNext = (recentNext + 1) % COMMAND_DEDUP;

  if (ackCount == ACK_QUEUE_CAPACITY) {
    memmove(&ackQueue[0], &ackQueue[1], sizeof(AckItem) * (ACK_QUEUE_CAPACITY - 1));
    ackCount--;
  }
  ackQueue[ackCount++] = item;
  logf("[cmd] %s -> %s%s%s", commandId, status == AckStatus::Done ? "DONE" : status == AckStatus::Rejected ? "REJECTED" : "EXPIRED",
       reason ? " " : "", reason ? reason : "");
}

static const AckItem *findRecent(const char *commandId) {
  for (uint8_t i = 0; i < COMMAND_DEDUP; i++) {
    if (recentCommands[i].commandId[0] && strcmp(recentCommands[i].commandId, commandId) == 0) return &recentCommands[i];
  }
  return nullptr;
}

// Lê o valor de "pin" direto do JSON bruto, para o PIN nunca passar pelo heap do ArduinoJson.
static bool extractPin(const char *json, char *out, size_t outLen) {
  const char *p = json;
  while ((p = strstr(p, "\"pin\"")) != nullptr) {
    const char *q = p + 5;
    while (*q == ' ' || *q == '\t') q++;
    if (*q != ':') {
      p += 5;
      continue;
    }
    q++;
    while (*q == ' ' || *q == '\t') q++;
    if (*q != '"') return false;
    q++;
    size_t n = 0;
    while (*q && *q != '"' && n + 1 < outLen) out[n++] = *q++;
    out[n] = '\0';
    return *q == '"';
  }
  return false;
}

static bool parseLock(const char *s, LockId &out) {
  if (!s) return false;
  if (strcmp(s, "MAIN") == 0) out = LockId::Main;
  else if (strcmp(s, "BACK") == 0) out = LockId::Back;
  else return false;
  return true;
}

static void executeCommand(const char *commandId, const char *type, JsonObjectConst params, char *raw, AckStatus &status,
                           const char *&reason) {
  status = AckStatus::Done;
  reason = nullptr;
  AccessOpts app;
  app.source = Source::App;

  if (strcmp(type, "UNLOCK") == 0) {
    LockId lock;
    if (!parseLock(params["lock"] | (const char *)nullptr, lock)) {
      status = AckStatus::Rejected;
      reason = "INVALID_PARAMS";
      return;
    }
#if !REMOTE_UNLOCK_DURING_LOCKOUT
    if (lockedOut) {
      status = AckStatus::Rejected;
      reason = "LOCKOUT_ACTIVE";
      return;
    }
#endif
    if (lock == LockId::Main) {
      pendingArm = false;
      if (alarmState != AlarmState::Disarmed) disarmAlarm(Source::App, -1);
    }
    unlock(lock, UNLOCK_MS);
    app.lock = lock;
    app.extra = UNLOCK_MS;
    emitAccess(AccessType::RemoteUnlock, Direction::Unknown, app);
    showTransient(Screen::Granted, 2000);
    buzzer.beep(1, 150);
  } else if (strcmp(type, "LOCK") == 0) {
    LockId lock;
    const char *which = params["lock"] | (const char *)nullptr;
    if (which && !parseLock(which, lock)) {
      status = AckStatus::Rejected;
      reason = "INVALID_PARAMS";
      return;
    }
    for (uint8_t i = 0; i < 2; i++) {
      if (which && i != (uint8_t)lock) continue;
      locks.lock(i);
      app.lock = (LockId)i;
      emitAccess(AccessType::RemoteLock, Direction::Unknown, app);
    }
  } else if (strcmp(type, "ARM") == 0) {
    if (alarmState != AlarmState::Disarmed) return;  // já armado: idempotente
    if (sensors[SENSOR_DOOR].state() != Reading::Closed || sensors[SENSOR_WINDOW].state() != Reading::Closed) {
      status = AckStatus::Rejected;
      reason = "POINTS_OPEN";
      return;
    }
    pendingArm = false;
    armAlarm(Source::App, -1);
  } else if (strcmp(type, "DISARM") == 0) {
    pendingArm = false;
    disarmAlarm(Source::App, -1);
  } else if (strcmp(type, "SILENCE_BUZZER") == 0) {
    buzzer.silence();
  } else if (strcmp(type, "BUZZER_TEST") == 0) {
    if (buzzer.sirenOn()) {
      status = AckStatus::Rejected;
      reason = "ALARM_ACTIVE";
      return;
    }
    buzzer.beep(2, 150, 150);
  } else if (strcmp(type, "SET_PIN") == 0) {
    int slot = params["slot"] | -1;
    const char *name = params["name"] | (const char *)nullptr;
    char pin[PIN_MAX_LEN + 2] = {};
    bool hasPin = extractPin(raw, pin, sizeof(pin));
    PinResult r = (hasPin && slot >= 0 && slot < PIN_SLOTS) ? pinStore.setSlot((uint8_t)slot, name, pin) : PinResult::InvalidPin;
    secureZero(pin, sizeof(pin));  // o PIN sai da RAM logo após gerar o hash
    if (r != PinResult::Ok) {
      status = AckStatus::Rejected;
      reason = r == PinResult::Duplicate ? "PIN_DUPLICATE" : "INVALID_PARAMS";
      return;
    }
    app.slot = (int8_t)slot;
    app.slotAction = SlotAction::Set;
    emitAccess(AccessType::PinChanged, Direction::Unknown, app);
  } else if (strcmp(type, "DELETE_PIN") == 0) {
    int slot = params["slot"] | -1;
    PinResult r = (slot >= 0 && slot < PIN_SLOTS) ? pinStore.deleteSlot((uint8_t)slot) : PinResult::InvalidSlot;
    if (r != PinResult::Ok) {
      status = AckStatus::Rejected;
      reason = r == PinResult::LastPin ? "LAST_PIN" : "INVALID_PARAMS";
      return;
    }
    app.slot = (int8_t)slot;
    app.slotAction = SlotAction::Delete;
    emitAccess(AccessType::PinChanged, Direction::Unknown, app);
  } else if (strcmp(type, "SET_THRESHOLD") == 0) {
    const char *which = params["sensor"] | (const char *)nullptr;
    int cm = params["closedMaxCm"] | -1;
    uint8_t idx = which && strcmp(which, "DOOR") == 0 ? SENSOR_DOOR : which && strcmp(which, "WINDOW") == 0 ? SENSOR_WINDOW : 0xFF;
    if (idx == 0xFF || cm < THRESHOLD_MIN_CM || cm > THRESHOLD_MAX_CM) {
      status = AckStatus::Rejected;
      reason = "INVALID_PARAMS";
      return;
    }
    sensors[idx].setClosedMaxCm((uint16_t)cm);
    uint16_t v = (uint16_t)cm;
    persist::save(idx == SENSOR_DOOR ? PERSIST_OFFSET(doorClosedMaxCm) : PERSIST_OFFSET(windowClosedMaxCm), v);
  } else if (strcmp(type, "SNAPSHOT") == 0) {
    snapshotRequested = true;
  } else {
    status = AckStatus::Rejected;
    reason = "UNKNOWN_COMMAND";
  }
  (void)commandId;
}

static void processCommand(char *raw) {
  // Filtro: o ArduinoJson nunca lê o campo "pin" (ele é extraído à parte e apagado em seguida).
  JsonDocument filter;
  filter["commandId"] = true;
  filter["type"] = true;
  filter["expiresAt"] = true;
  filter["params"]["lock"] = true;
  filter["params"]["slot"] = true;
  filter["params"]["name"] = true;
  filter["params"]["sensor"] = true;
  filter["params"]["closedMaxCm"] = true;

  JsonDocument doc;
  DeserializationError err = deserializeJson(doc, (const char *)raw, DeserializationOption::Filter(filter));
  const char *commandId = doc["commandId"] | (const char *)nullptr;
  const char *type = doc["type"] | (const char *)nullptr;
  if (err || !commandId || !type || strlen(commandId) >= sizeof(AckItem::commandId)) {
    logf("[cmd] comando ignorado (JSON inválido)");
    return;
  }

  const AckItem *previous = findRecent(commandId);
  if (previous) {  // repetido: não executa de novo, só reenvia o mesmo resultado
    queueAck(commandId, previous->status, previous->reason);
    return;
  }

  uint32_t expiresAt = parseIso(doc["expiresAt"] | (const char *)nullptr);
  if (!expiresAt) {
    queueAck(commandId, AckStatus::Rejected, "INVALID_PARAMS");
    return;
  }
  // Sem horário confiável não dá para checar a validade; o backend expira o comando em 30 s
  // e a sessão MQTT limpa (cleanSession) impede receber comandos antigos ao reconectar.
  if (timeValid && nowEpoch() > expiresAt) {
    queueAck(commandId, AckStatus::Expired, nullptr);
    return;
  }

  AckStatus status;
  const char *reason;
  executeCommand(commandId, type, doc["params"].as<JsonObjectConst>(), raw, status, reason);
  queueAck(commandId, status, reason);
}

static void processPendingCommands() {
  for (uint8_t i = 0; i < cmdPending; i++) {
    processCommand(cmdBuf[i]);
    secureZero(cmdBuf[i], sizeof(cmdBuf[i]));
  }
  cmdPending = 0;
}

// Chamado de dentro de mqtt.loop()/publish(): só copia; nada de publicar aqui.
static void onMqttMessage(MQTTClient *, char topic[], char bytes[], int length) {
  if (strcmp(topic, topicCommands) != 0) return;
  if (length <= 0 || length > COMMAND_PAYLOAD_MAX || cmdPending >= 2) {
    logf("[cmd] comando descartado (tamanho ou fila cheia)");
    return;
  }
  memcpy(cmdBuf[cmdPending], bytes, length);
  cmdBuf[cmdPending][length] = '\0';
  cmdPending++;
}

// ======================================================================= Rede

static bool canBlock() {
  // WiFi.begin() e o connect do MQTT travam o loop por alguns segundos: só com o teclado ocioso
  // e sem trava aberta/servo em movimento. (A sirene ativa continua tocando durante o bloqueio.)
  return inputLen == 0 && inputMode == InputMode::Entry && !locks.busy() && millis() - lastKeyAt > 3000;
}

static void publishHeartbeat() {
  JsonDocument doc;
  doc["deviceId"] = DEVICE_ID;
  doc["status"] = "ONLINE";
  doc["uptimeMs"] = (uint32_t)millis();
  doc["queued"] = eventQueue.size();
  doc["rssi"] = (int)WiFi.RSSI();
  doc["firmware"] = FIRMWARE_VERSION;
  doc["alarm"] = alarmState == AlarmState::Armed ? "ARMED" : alarmState == AlarmState::Triggered ? "TRIGGERED" : "DISARMED";
  doc["lockout"] = lockedOut;
  JsonObject lk = doc["locks"].to<JsonObject>();
  lk["MAIN"] = locks.isUnlocked(0) ? "UNLOCKED" : "LOCKED";
  lk["BACK"] = locks.isUnlocked(1) ? "UNLOCKED" : "LOCKED";
  JsonArray arr = doc["sensors"].to<JsonArray>();
  for (uint8_t i = 0; i < SENSOR_COUNT; i++) {
    JsonObject s = arr.add<JsonObject>();
    s["pointId"] = SENSOR_POINT_IDS[i];
    s["state"] = readingName(sensors[i].state());
    if (sensors[i].distanceCm() != NO_DISTANCE) s["distanceCm"] = sensors[i].distanceCm();
    s["closedMaxCm"] = sensors[i].closedMaxCm();
  }
  char payload[MQTT_BUFFER - 96];
  size_t n = serializeJson(doc, payload, sizeof(payload));
  if (n == 0 || n >= sizeof(payload)) return;
  if (!mqtt.publish(topicStatus, payload, false, 1)) logf("[net] heartbeat sem PUBACK");
}

static bool publishAck(const AckItem &a) {
  JsonDocument doc;
  doc["commandId"] = a.commandId;
  doc["status"] = a.status == AckStatus::Done ? "DONE" : a.status == AckStatus::Rejected ? "REJECTED" : "EXPIRED";
  if (a.reason) doc["reason"] = a.reason;
  char payload[128];
  serializeJson(doc, payload, sizeof(payload));
  return mqtt.publish(topicAck, payload, false, 1);
}

static void connectMqtt() {
  char clientId[48];
  snprintf(clientId, sizeof(clientId), "lock-%s", DEVICE_ID);
  unsigned long t0 = millis();
  // Usuário = deviceId, senha = credencial do dispositivo (validada pelo broker + ACL).
  bool ok = mqtt.connect(clientId, DEVICE_ID, DEVICE_KEY);
  logf("[net] MQTT connect %s (bloqueou %lu ms)", ok ? "OK" : "falhou", millis() - t0);
  if (!ok) return;
  mqttUp = true;
  mqtt.subscribe(topicCommands, 1);
  publishHeartbeat();
  lastHeartbeat = millis();
  snapshotRequested = true;  // ao reconectar, informa o estado atual de tudo
}

static void updateClock(unsigned long now) {
  bool due = !timeValid ? (now - lastNtpTry >= NTP_RETRY_MS) : (now - lastNtpSync >= NTP_RESYNC_MS && now - lastNtpTry >= NTP_RETRY_MS);
  if (!due) return;
  lastNtpTry = now;
  unsigned long epoch = WiFi.getTime();  // NTP feito pelo módulo ESP32-S3; 0 = ainda indisponível
  if (epoch > EPOCH_2025) {
    syncClock((uint32_t)epoch);
    lastNtpSync = now;
    RTCTime t((time_t)epoch);
    RTC.setTime(t);
    logf("[time] sincronizado via NTP");
  }
}

// Com o secrets.h de exemplo não há rede para conectar: evita travar o loop à toa.
static const bool networkEnabled = strcmp(WIFI_SSID, "minha-rede") != 0;

static void updateNetwork(unsigned long now) {
  if (!networkEnabled) return;
  if (!wifiUp) {
    if (now - lastWifiCheck >= 2000) {
      lastWifiCheck = now;
      if (WiFi.status() == WL_CONNECTED) {
        wifiUp = true;
        logf("[net] Wi-Fi conectado");
        return;
      }
    }
    if ((firstWifiTry || now - lastWifiTry >= WIFI_RETRY_MS) && canBlock()) {
      firstWifiTry = false;
      lastWifiTry = millis();
      unsigned long t0 = millis();
      int st = WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
      logf("[net] WiFi.begin -> %d (bloqueou %lu ms)", st, millis() - t0);
      lastWifiCheck = 0;
    }
    return;
  }

  if (now - lastWifiCheck >= 5000) {
    lastWifiCheck = now;
    if (WiFi.status() != WL_CONNECTED) {
      logf("[net] Wi-Fi caiu");
      wifiUp = false;
      mqttUp = false;
      lastWifiTry = now;
      return;
    }
  }

  updateClock(now);

  if (now - lastMqttLoop < MQTT_LOOP_MS) return;
  lastMqttLoop = now;

  if (!mqttUp || !mqtt.connected()) {
    if (mqttUp) logf("[net] MQTT desconectado");
    mqttUp = false;
    if (now - lastMqttTry >= MQTT_RETRY_MS && canBlock()) {
      lastMqttTry = millis();
      connectMqtt();
    }
    return;
  }

  mqtt.loop();
  processPendingCommands();

  if (now - lastPublishAt >= PUBLISH_INTERVAL_MS) {
    lastPublishAt = now;
    if (ackCount > 0) {
      if (publishAck(ackQueue[0])) {
        memmove(&ackQueue[0], &ackQueue[1], sizeof(AckItem) * (ACK_QUEUE_CAPACITY - 1));
        ackCount--;
      }
    } else {
      QueuedEvent evt;
      if (eventQueue.peek(evt)) {
        char payload[MQTT_BUFFER - 96];
        size_t n = serializeEvent(evt, payload, sizeof(payload));
        if (n == 0) {
          eventQueue.pop();  // não cabe: descarta para não travar a fila
        } else if (mqtt.publish(evt.kind == EventKind::Sensor ? topicSensors : topicAccess, payload, false, 1)) {
          eventQueue.pop();  // QoS 1: sai da fila só após o PUBACK
        } else {
          lastPublishAt = now + 1000;  // sem PUBACK: tenta de novo em ~1 s
        }
      }
    }
  }

  if (snapshotRequested) {
    snapshotRequested = false;
    publishHeartbeat();
    lastHeartbeat = millis();
    for (uint8_t i = 0; i < SENSOR_COUNT; i++) emitSensor(i);
  }

  if (now - lastHeartbeat >= HEARTBEAT_INTERVAL_MS) {
    publishHeartbeat();
    lastHeartbeat = millis();
  }
}

// ======================================================================= Diagnóstico pelo Serial
// 's' = estado atual, 'r' = reinicia a placa. Nunca mostra senhas, hashes ou chaves.

static void printStatus() {
  unsigned long now = millis();
  logf("---- status (uptime %lu s, boot #%lu, fw %s)", now / 1000, (unsigned long)bootCount, FIRMWARE_VERSION);
  for (uint8_t i = 0; i < SENSOR_COUNT; i++) {
    uint16_t d = sensors[i].distanceCm();
    logf("sensor %-6s: %-7s distancia=%s%u cm  limite=%u cm", i == SENSOR_DOOR ? "porta" : "janela", readingName(sensors[i].state()),
         d == NO_DISTANCE ? ">" : "", d == NO_DISTANCE ? ULTRA_MAX_CM : d, sensors[i].closedMaxCm());
  }
  logf("travas: MAIN=%s BACK=%s", locks.isUnlocked(0) ? "LIBERADA" : "trancada", locks.isUnlocked(1) ? "LIBERADA" : "trancada");
  logf("alarme: %s%s | bloqueio: %s | tentativas erradas: %u",
       alarmState == AlarmState::Armed ? "ARMADO" : alarmState == AlarmState::Triggered ? "DISPARADO" : "desarmado",
       pendingArm ? " (armando)" : "", lockedOut ? "SIM" : "nao", failedAttempts);
  for (uint8_t s = 0; s < PIN_SLOTS; s++) {
    if (pinStore.name(s)) logf("slot %u: %s", s, pinStore.name(s));
  }
  logf("hash da senha: %lu ms (%d rodadas)", pinStore.hashMs(), PIN_HASH_ROUNDS);
  logf("rede: wifi=%s mqtt=%s | fila=%u (descartados %lu) | horario=%s", wifiUp ? "ok" : "off", mqttUp ? "ok" : "off",
       eventQueue.size(), (unsigned long)eventQueue.dropped(), timeValid ? "ok" : "sem NTP");
}

static void handleSerial() {
  while (Serial.available()) {
    int c = Serial.read();
    if (c == 's') printStatus();
    else if (c == 'k') {
      keyEcho = !keyEcho;
      logf("[diag] eco das teclas %s", keyEcho ? "LIGADO (mostra os digitos!)" : "desligado");
    }
    else if (c == 'u') {
      // Leituras brutas dos ultrassônicos: FALHA = ECHO não subiu; LONGE = sem eco até ULTRA_MAX_CM.
      for (uint8_t i = 0; i < SENSOR_COUNT; i++) {
        char line[96];
        size_t n = snprintf(line, sizeof(line), "[diag] %s (ECHO antes=%s):", i == SENSOR_DOOR ? "porta " : "janela",
                            sensors[i].echoHigh() ? "ALTO" : "baixo");
        for (uint8_t k = 0; k < 5 && n < sizeof(line) - 8; k++) {
          uint16_t v = sensors[i].rawMeasure();
          if (v == Ultrasonic::SAMPLE_FAULT) n += snprintf(line + n, sizeof(line) - n, " FALHA");
          else if (v == Ultrasonic::SAMPLE_FAR) n += snprintf(line + n, sizeof(line) - n, " LONGE");
          else n += snprintf(line + n, sizeof(line) - n, " %ucm", v);
          delay(70);
        }
        Serial.println(line);
      }
    } else if (c == 'w') {
      // Testes de fiação: pulseIn com espera longa, nos pinos normais e com TRIG/ECHO trocados.
      const uint8_t trig[2] = {DOOR_TRIG_PIN, WINDOW_TRIG_PIN};
      const uint8_t echo[2] = {DOOR_ECHO_PIN, WINDOW_ECHO_PIN};
      for (uint8_t i = 0; i < SENSOR_COUNT; i++) {
        for (uint8_t swap = 0; swap < 2; swap++) {
          uint8_t t = swap ? echo[i] : trig[i], e = swap ? trig[i] : echo[i];
          pinMode(t, OUTPUT);
          pinMode(e, INPUT);
          digitalWrite(t, LOW);
          delayMicroseconds(5);
          digitalWrite(t, HIGH);
          delayMicroseconds(10);
          digitalWrite(t, LOW);
          unsigned long us = pulseIn(e, HIGH, 60000UL);
          logf("[diag] %s %s: pulseIn=%lu us (%lu cm)", i == SENSOR_DOOR ? "porta " : "janela", swap ? "TROCADO" : "normal ", us, us / 58);
          delay(80);
        }
        sensors[i].begin(trig[i], echo[i], sensors[i].closedMaxCm());  // restaura os pinos
      }
    } else if (c == 't') {
      // Teste de atuadores: bipe e os dois servos (um de cada vez), sem gerar eventos.
      logf("[diag] teste: buzzer + servo MAIN + servo BACK (2 s cada)");
      buzzer.beep(2, 150, 150);
      locks.unlock((uint8_t)LockId::Main, 2000);
      locks.unlock((uint8_t)LockId::Back, 2000);
    } else if (c == 'r') {
      logf("[diag] reiniciando...");
      Serial.flush();
      delay(50);
      NVIC_SystemReset();
    }
  }
}

// ======================================================================= setup / loop

void setup() {
  // Fail-secure: LEDs e buzzer desligados; os servos vão para "trancado" no primeiro update().
  pinMode(LED_UNLOCKED_PIN, OUTPUT);
  pinMode(LED_ALARM_PIN, OUTPUT);
  digitalWrite(LED_UNLOCKED_PIN, LOW);
  digitalWrite(LED_ALARM_PIN, LOW);
  buzzer.begin();
  locks.begin();
  locks.update(millis());
  pinMode(EXIT_BUTTON_PIN, INPUT_PULLUP);

  Serial.begin(115200);
  unsigned long serialWait = millis();
  while (!Serial && millis() - serialWait < 1500) {
  }

  ui.begin();

  uint32_t magic = 0;
  persist::load(PERSIST_OFFSET(magic), magic);
  uint8_t version = 0;
  persist::load(PERSIST_OFFSET(version), version);
  bool fresh = magic != PERSIST_MAGIC || version != PERSIST_VERSION;
  if (fresh) {
    logf("[boot] EEPROM vazia: inicializando");
    PersistLayout defaults = {};
    defaults.magic = 0;  // gravado por último: inicialização interrompida é refeita no próximo boot
    defaults.version = PERSIST_VERSION;
    defaults.doorClosedMaxCm = DOOR_CLOSED_MAX_CM;
    defaults.windowClosedMaxCm = WINDOW_CLOSED_MAX_CM;
    persist::saveBytes(0, &defaults, PERSIST_OFFSET(salt));
  }

  persist::load(PERSIST_OFFSET(bootCount), bootCount);
  bootCount++;
  persist::save(PERSIST_OFFSET(bootCount), bootCount);

  pinStore.begin(fresh, INITIAL_LOCK_PIN, INITIAL_LOCK_NAME, DEVICE_ID);
  if (fresh) {
    uint32_t m = PERSIST_MAGIC;
    persist::save(PERSIST_OFFSET(magic), m);
  }
  logf("[pin] %u slot(s) em uso; hash leva %lu ms (%d rodadas)", pinStore.usedCount(), pinStore.hashMs(), PIN_HASH_ROUNDS);

  // Reiniciar não encerra bloqueio nem desarma o alarme.
  uint8_t lo = 0, alarm = 0;
  persist::load(PERSIST_OFFSET(failedAttempts), failedAttempts);
  persist::load(PERSIST_OFFSET(lockedOut), lo);
  persist::load(PERSIST_OFFSET(alarmState), alarm);
  if (failedAttempts > MAX_FAILED_ATTEMPTS) failedAttempts = 0;
  if (lo == 1) {
    lockedOut = true;
    lockoutStartedAt = millis();
    logf("[lock] bloqueio retomado após reinício");
  }
  if (alarm <= 2) alarmState = (AlarmState)alarm;
  if (alarmState == AlarmState::Triggered) buzzer.siren(ALARM_SIREN_MAX_MS);

  uint16_t doorCm = DOOR_CLOSED_MAX_CM, windowCm = WINDOW_CLOSED_MAX_CM;
  persist::load(PERSIST_OFFSET(doorClosedMaxCm), doorCm);
  persist::load(PERSIST_OFFSET(windowClosedMaxCm), windowCm);
  if (doorCm < THRESHOLD_MIN_CM || doorCm > THRESHOLD_MAX_CM) doorCm = DOOR_CLOSED_MAX_CM;
  if (windowCm < THRESHOLD_MIN_CM || windowCm > THRESHOLD_MAX_CM) windowCm = WINDOW_CLOSED_MAX_CM;
  sensors[SENSOR_DOOR].begin(DOOR_TRIG_PIN, DOOR_ECHO_PIN, doorCm);
  sensors[SENSOR_WINDOW].begin(WINDOW_TRIG_PIN, WINDOW_ECHO_PIN, windowCm);

  keypad.setDebounceTime(30);

  // O RTC continua contando após um reset (não após falta de energia).
  RTC.begin();
  RTCTime t;
  if (RTC.getTime(t) && (uint32_t)t.getUnixTime() > EPOCH_2025) syncClock((uint32_t)t.getUnixTime());

  snprintf(topicAccess, sizeof(topicAccess), "home/devices/%s/events/access", DEVICE_ID);
  snprintf(topicSensors, sizeof(topicSensors), "home/devices/%s/events/sensors", DEVICE_ID);
  snprintf(topicStatus, sizeof(topicStatus), "home/devices/%s/status", DEVICE_ID);
  snprintf(topicCommands, sizeof(topicCommands), "home/devices/%s/commands", DEVICE_ID);
  snprintf(topicAck, sizeof(topicAck), "home/devices/%s/commands/ack", DEVICE_ID);

#ifdef MQTT_USE_TLS
  netClient.setCACert(MQTT_CA_CERT);
#endif
  mqtt.begin(MQTT_HOST, MQTT_PORT, netClient);
  mqtt.setKeepAlive(30);
  mqtt.setCleanSession(true);
  mqtt.setTimeout(MQTT_TIMEOUT_MS);
  // Testamento: o broker publica OFFLINE se a conexão cair sem aviso.
  mqtt.setWill(topicStatus, "{\"status\":\"OFFLINE\"}", false, 1);
  mqtt.onMessageAdvanced(onMqttMessage);

  if (!networkEnabled) logf("[net] rede desativada: secrets.h ainda tem os valores de exemplo");
  else if (WiFi.status() == WL_NO_MODULE) logf("[net] módulo Wi-Fi não respondeu");
  logf("[boot] Fechadura pronta (boot #%lu, firmware %s)", (unsigned long)bootCount, FIRMWARE_VERSION);
}

void loop() {
  unsigned long now = millis();

  char key = keypad.getKey();
  if (key) handleKey(key);
  if ((inputLen > 0 || inputMode == InputMode::Exit) && now - lastKeyAt > INPUT_TIMEOUT_MS) clearInput();

  updateExitButton(now);
  updateSensors(now);
  updateLockout(now);
  updateAlarmTimers(now);
  locks.update(now);
  buzzer.update(now);
  updateIndicators(now);
  updateNetwork(now);
  handleSerial();
}
