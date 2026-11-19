#pragma once
// Copie este arquivo para secrets.h e preencha. secrets.h NÃO deve ser versionado.

// ---------------- Wi-Fi
#define WIFI_SSID "minha-rede"
#define WIFI_PASSWORD "senha-do-wifi"

// ---------------- Broker MQTT
#define MQTT_HOST "192.168.0.10"
#define MQTT_PORT 1883
// Para TLS, descomente e informe o certificado da CA do broker (porta 8883):
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

// ---------------- Pontos monitorados por este dispositivo
// pointId = ID do ponto cadastrado em Configurações no painel.
struct SensorConfig {
  int pin;
  const char *pointId;
};
static const SensorConfig SENSORS[] = {
    {4, "00000000-0000-0000-0000-000000000000"},  // porta principal
    // {5, "uuid-da-janela-da-cozinha"},
};

// ---------------- Senha inicial da fechadura
// Usada SOMENTE no primeiro boot para gerar o hash salvo na flash (NVS).
// Depois, troque pelo teclado: A <senha atual> # <nova> # <nova> #
// A senha nunca é enviada ao backend.
#define INITIAL_LOCK_PIN "2580"
