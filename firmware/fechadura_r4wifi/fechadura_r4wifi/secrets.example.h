#pragma once
// Copie este arquivo para secrets.h (na mesma pasta) e preencha.
// secrets.h NÃO vai para o Git (está no .gitignore).
// Enquanto WIFI_SSID for "minha-rede", a rede fica desligada e a fechadura roda só no modo local.

// ---------------- Wi-Fi (somente 2,4 GHz)
#define WIFI_SSID "minha-rede"
#define WIFI_PASSWORD "senha-do-wifi"

// ---------------- Broker MQTT (IP do computador que roda o docker compose)
#define MQTT_HOST "192.168.0.10"
#define MQTT_PORT 1883
#define MQTT_USER "fechadura"      // deixe "" se o broker aceitar conexão anônima
#define MQTT_PASSWORD "troque-esta-senha"

// ---------------- Identificação (usada no client id do MQTT e no id dos eventos)
#define DEVICE_ID "fechadura-01"
