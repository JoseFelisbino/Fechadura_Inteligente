#pragma once
// =============================================================================
// config.h — pinos e tempos da fechadura (Arduino Uno R4 WiFi)
// Aqui ficam só valores sem segredo. Wi-Fi e broker ficam em secrets.h.
// =============================================================================

#include <Arduino.h>

// ----------------------------------------------------------------------- Pinos
// Teclado de membrana 4x4: linhas 1 a 4 e colunas 1 a 4.
static const uint8_t PINOS_LINHAS[4] = {9, 8, 7, 6};
static const uint8_t PINOS_COLUNAS[4] = {5, 4, 3, 2};

#define PINO_SERVO 10        // micro servo SG90 = a porta (0° fechada, 90° aberta)
#define PINO_BOTAO_SAIDA 12  // botão de saída (INPUT_PULLUP: o outro terminal vai no GND)
#define PINO_BUZZER 13       // buzzer (+). O LED "L" da placa pisca junto
#define PINO_TRIG A0         // ultrassônico HC-SR04: TRIG
#define PINO_ECHO A1         // ultrassônico HC-SR04: ECHO
#define PINO_LED A4          // LED de status (com resistor de 220 ohms)

// ----------------------------------------------------------------------- Servo
#define ANGULO_FECHADA 0
#define ANGULO_ABERTA 90
#define TEMPO_MOVIMENTO_SERVO_MS 500UL  // depois disso o sinal é desligado (menos tremida)

// ----------------------------------------------------------------------- Senhas
#define SENHA_PADRAO "1234"      // gravada no slot 1 no primeiro boot (EEPROM vazia)
#define NOME_PADRAO "Admin"
#define NUM_SENHAS 3             // slots 1, 2 e 3
#define SENHA_MIN 4
#define SENHA_MAX 8
#define NOME_MAX 16

// ----------------------------------------------------------------------- Comportamento
#define OPEN_MS 5000UL                  // padrão: tempo que a porta fica aberta (o app pode mudar)
#define TEMPO_ABERTURA_MIN_MS 1000UL
#define TEMPO_ABERTURA_MAX_MS 60000UL
#define DIGITACAO_EXPIRA_MS 10000UL     // a digitação é apagada após 10 s parado
#define MAX_ERROS 3                     // erros seguidos até o bloqueio
#define BLOQUEIO_MS 30000UL             // duração do bloqueio
#define VERIFICAR_FECHAMENTO_MS 1500UL  // após o servo voltar a 0°, confere se a porta fechou
#define TELA_TEMPORARIA_MS 1500UL       // tempo do ✓ / ✗ na matriz

// ----------------------------------------------------------------------- Ultrassônico
#define DOOR_CLOSED_MAX_CM 10       // padrão: fechada se distância <= isto (o app pode mudar)
#define LIMITE_MIN_CM 2
#define LIMITE_MAX_CM 100
#define HISTERESE_CM 2              // só "abre" acima de limite + histerese (evita piscar)
#define INTERVALO_PING_MS 65UL      // 3 pings por mediana => uma leitura a cada ~200 ms
#define ALCANCE_MAX_CM 200          // além disso: nada perto => conta como aberta
#define CONFIRMACOES 2              // medianas seguidas antes de mudar o estado

// ----------------------------------------------------------------------- Rede
#define INTERVALO_WIFI_MS 30000UL   // WiFi.begin() trava alguns segundos: tenta no máximo a cada 30 s
#define INTERVALO_MQTT_MS 10000UL
#define INTERVALO_ESTADO_MS 2000UL  // publica fechadura/estado a cada 2 s
#define INTERVALO_NTP_MS 5000UL
#define TAMANHO_FILA 20             // eventos guardados em RAM enquanto estiver sem rede
#define BUFFER_MQTT 512
