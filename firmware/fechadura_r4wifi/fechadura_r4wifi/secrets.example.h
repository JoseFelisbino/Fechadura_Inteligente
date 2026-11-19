#pragma once
// Copie este arquivo para secrets.h (na mesma pasta) e preencha.
// secrets.h NÃO deve ser versionado nem compartilhado.

// ---------------- Wi-Fi (2,4 GHz)
#define WIFI_SSID "minha-rede"
#define WIFI_PASSWORD "senha-do-wifi"

// ---------------- Broker MQTT (IP do computador que roda o docker compose)
#define MQTT_HOST "192.168.0.10"
#define MQTT_PORT 1883
// Para TLS (porta 8883), descomente e informe o certificado da CA do broker:
// #define MQTT_USE_TLS
// static const char MQTT_CA_CERT[] = R"EOF(
// -----BEGIN CERTIFICATE-----
// ...
// -----END CERTIFICATE-----
// )EOF";

// ---------------- Identidade do dispositivo
// Gerados por: cd backend && npm run device:provision -- --id <id-do-dispositivo>
#define DEVICE_ID "00000000-0000-0000-0000-000000000000"
#define DEVICE_KEY "cole-aqui-a-chave-exibida-uma-unica-vez"

// ---------------- Pontos monitorados (IDs cadastrados em Configurações no painel)
#define DOOR_POINT_ID "00000000-0000-0000-0000-000000000000"    // ultrassônico 1: porta principal
#define WINDOW_POINT_ID "00000000-0000-0000-0000-000000000000"  // ultrassônico 2: janela
// As travas são identificadas pelos códigos fixos "MAIN" (servo 1) e "BACK" (servo 2).

// ---------------- Senha inicial (slot 0)
// Usada SOMENTE quando a EEPROM está vazia (primeiro boot). Fica salva apenas como hash.
// Depois disso, as senhas são gerenciadas pelo app (comandos SET_PIN / DELETE_PIN).
#define INITIAL_LOCK_PIN "2580"
#define INITIAL_LOCK_NAME "Principal"
