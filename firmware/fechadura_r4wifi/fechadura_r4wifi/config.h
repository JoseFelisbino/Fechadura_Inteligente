#pragma once
// Configuração de hardware e de comportamento (Arduino Uno R4 WiFi). Valores sem segredos.
// Credenciais e IDs da instalação ficam em secrets.h (não versionado).

#include <Arduino.h>
#include <stdint.h>

// ======================================================================= Pinos
// Teclado de membrana 4x4: linhas 1-4 e colunas 1-4.
#define KEYPAD_ROWS 4
#define KEYPAD_COLS 4
static const uint8_t KEYPAD_ROW_PINS[KEYPAD_ROWS] = {9, 8, 7, 6};
static const uint8_t KEYPAD_COL_PINS[KEYPAD_COLS] = {5, 4, 3, 2};

#define SERVO_MAIN_PIN 10   // trava da porta principal
#define SERVO_BACK_PIN 11   // trava da porta dos fundos
#define EXIT_BUTTON_PIN 12  // botão interno de saída (INPUT_PULLUP, outro terminal no GND)
#define BUZZER_PIN 13       // D13 também é o LED embutido "L": ele pisca junto com o buzzer

#define DOOR_TRIG_PIN A0    // ultrassônico 1: porta principal
#define DOOR_ECHO_PIN A1
#define WINDOW_TRIG_PIN A2  // ultrassônico 2: janela
#define WINDOW_ECHO_PIN A3

#define LED_UNLOCKED_PIN A4  // LED "trava liberada" (resistor de 220 ohms). A4/A5 = I2C, sem uso aqui.
#define LED_ALARM_PIN A5     // LED "alarme" (resistor de 220 ohms)

// ======================================================================= Buzzer
// Descomente para buzzer PASSIVO (usa tone()). Comentado = buzzer ATIVO (nível alto liga).
// #define BUZZER_PASSIVE
#define BUZZER_TONE_HZ 2700

// ======================================================================= Servos (travas)
#define SERVO_LOCKED_DEG 0      // trava fechada (posição no boot: fail-secure)
#define SERVO_UNLOCKED_DEG 90   // trava liberada
#define SERVO_MOVE_MS 450UL     // tempo reservado para um movimento completo
#define SERVO_DETACH_AFTER_MOVE 1  // 1 = desliga o sinal após mover (menos ruído e consumo)

// ======================================================================= Fechadura
#define UNLOCK_MS 5000UL             // tempo que a trava fica liberada
#define DOOR_OPEN_GRACE_MS 10000UL   // após liberar, a porta pode abrir até UNLOCK_MS + isto sem disparar o alarme
#define MAX_FAILED_ATTEMPTS 3        // senhas incorretas consecutivas até o bloqueio
#define LOCKOUT_MS 60000UL           // período de bloqueio padrão: 60 s
#define LOCKOUT_BUZZER_MS 3000UL     // alarme do buzzer ao iniciar o bloqueio
#define INPUT_TIMEOUT_MS 10000UL     // limpa a digitação após inatividade
#define PIN_MIN_LEN 4
#define PIN_MAX_LEN 8
#define PIN_SLOTS 5
#define PIN_NAME_MAX 16
#define PIN_HASH_ROUNDS 2000         // iterações SHA-256 (o tempo medido aparece no Serial no boot)

// O app pode destrancar durante um bloqueio por senhas erradas? 0 = não (recomendado).
#define REMOTE_UNLOCK_DURING_LOCKOUT 0

// ======================================================================= Alarme / saída
#define EXIT_ARM_WINDOW_MS 120000UL   // após uma saída liberada, a porta precisa abrir e fechar neste prazo para armar
#define ALARM_SIREN_MAX_MS 180000UL   // a sirene para sozinha após 3 min (o alarme continua disparado)
#define DOOR_OPEN_WARN_MS 60000UL     // aviso local de porta aberta (o alerta oficial é do backend)
#define DOOR_OPEN_WARN_REPEAT_MS 10000UL

// ======================================================================= Ultrassônicos (HC-SR04)
#define ULTRA_INTERVAL_MS 60UL       // intervalo entre disparos; os sensores são lidos alternadamente
#define ULTRA_ECHO_START_US 3000UL   // ECHO precisa subir neste tempo; senão = falha (sem eco)
#define ULTRA_MAX_CM 200             // além disso = "longe" (tratado como aberto)
#define ULTRA_SAMPLES 3              // mediana de 3 leituras
#define ULTRA_HYSTERESIS_CM 3        // fecha <= limite; abre > limite + histerese
#define ULTRA_DEBOUNCE_COUNT 2       // medianas seguidas com o novo estado antes de mudar
#define ULTRA_UNKNOWN_COUNT 3        // medianas seguidas sem eco até virar UNKNOWN
#define DOOR_CLOSED_MAX_CM 8         // padrão de fábrica; o app pode alterar (SET_THRESHOLD, salvo na EEPROM)
#define WINDOW_CLOSED_MAX_CM 8
#define THRESHOLD_MIN_CM 2
#define THRESHOLD_MAX_CM 150

// ======================================================================= Rede
#define HEARTBEAT_INTERVAL_MS 30000UL  // backend considera offline após 90 s (HEARTBEAT_TIMEOUT_SECONDS)
#define WIFI_RETRY_MS 30000UL          // WiFi.begin() bloqueia: tentativas espaçadas e só com o teclado ocioso
#define MQTT_RETRY_MS 15000UL
#define MQTT_TIMEOUT_MS 800            // espera máxima pelo PUBACK/CONNACK
#define MQTT_LOOP_MS 50UL
#define MQTT_BUFFER 768
#define PUBLISH_INTERVAL_MS 100UL
#define NTP_RETRY_MS 5000UL
#define NTP_RESYNC_MS 3600000UL
#define EVENT_QUEUE_CAPACITY 64        // fila offline em RAM (estrutura compacta, ~32 bytes por evento)
#define ACK_QUEUE_CAPACITY 4
#define COMMAND_DEDUP 8                // últimos commandId lembrados
#define COMMAND_PAYLOAD_MAX 320
#define FIRMWARE_VERSION "2.0.0-r4"
