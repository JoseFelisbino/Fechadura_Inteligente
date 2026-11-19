#pragma once
// Configuração de hardware e de comportamento. Valores sem segredos.
// Credenciais e IDs da instalação ficam em secrets.h (não versionado).

#include <stdint.h>

// ---------------- Teclado matricial 4x4
#define KEYPAD_ROWS 4
#define KEYPAD_COLS 4
static const uint8_t KEYPAD_ROW_PINS[KEYPAD_ROWS] = {13, 12, 14, 27};
static const uint8_t KEYPAD_COL_PINS[KEYPAD_COLS] = {26, 25, 33, 32};

// ---------------- Atuadores
#define RELAY_PIN 23
#define RELAY_ACTIVE_LEVEL HIGH      // nível que ENERGIZA o relé (libera a trava)
#define BUZZER_PIN 22

// Botão interno de saída (opcional). -1 = desabilitado.
// Quando habilitado, gera ACCESS_GRANTED com direction=EXIT (mecanismo de direção).
#define EXIT_BUTTON_PIN -1

// ---------------- Tempos da fechadura
#define RELAY_PULSE_MS 3000UL        // tempo que a trava fica liberada após senha correta
#define RELAY_MAX_MS 10000UL         // limite de segurança: o relé nunca fica ligado mais que isso
#define MAX_FAILED_ATTEMPTS 3        // tentativas incorretas consecutivas até o bloqueio
#define LOCKOUT_MS 60000UL           // período de bloqueio padrão: 60 s
#define BUZZER_ALARM_MS 3000UL       // duração do alarme do buzzer ao bloquear
#define INPUT_TIMEOUT_MS 10000UL     // limpa a digitação após inatividade
#define PIN_MIN_LEN 4
#define PIN_MAX_LEN 8
#define PIN_HASH_ROUNDS 2000         // iterações SHA-256 do hash da senha armazenada

// ---------------- Sensores magnéticos (reed switch)
// Ligação: um terminal no GPIO (INPUT_PULLUP) e outro no GND.
// Ímã próximo (fechado) => LOW. Sem ímã (aberto) => HIGH.
#define SENSOR_DEBOUNCE_MS 50UL
#define MAX_SENSORS 4

// ---------------- Rede
#define HEARTBEAT_INTERVAL_MS 30000UL  // backend considera offline após 90 s (HEARTBEAT_TIMEOUT_SECONDS)
#define MQTT_RECONNECT_MS 5000UL
#define WIFI_RECONNECT_MS 10000UL
#define EVENT_QUEUE_CAPACITY 64        // fila local de eventos enquanto offline (RAM)
#define EVENT_PAYLOAD_MAX 320
#define FIRMWARE_VERSION "1.0.0"
