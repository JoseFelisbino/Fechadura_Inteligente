#pragma once
// =============================================================================
// sinais.h — buzzer e LED de status, sem delay()
// =============================================================================

#include <Arduino.h>
#include "config.h"

// Buzzer ativo: nível alto liga. Toca uma sequência de bipes ou fica ligado direto (alarme).
class Buzzer {
 public:
  void iniciar() {
    pinMode(PINO_BUZZER, OUTPUT);
    digitalWrite(PINO_BUZZER, LOW);
  }

  // "quantidade" bipes de "ligadoMs", com "desligadoMs" entre eles. Ignorado durante o alarme.
  void bipar(uint8_t quantidade, uint16_t ligadoMs, uint16_t desligadoMs = 120) {
    if (continuo_) return;
    restantes_ = quantidade;
    ligadoMs_ = ligadoMs;
    desligadoMs_ = desligadoMs;
    ligar(true);
    proximaTroca_ = millis() + ligadoMs_;
  }

  void continuo(bool ligado) {
    continuo_ = ligado;
    restantes_ = 0;
    ligar(ligado);
  }

  void atualizar(unsigned long agora) {
    if (continuo_ || restantes_ == 0 || (long)(agora - proximaTroca_) < 0) return;
    if (tocando_) {
      ligar(false);
      if (--restantes_ > 0) proximaTroca_ = agora + desligadoMs_;
    } else {
      ligar(true);
      proximaTroca_ = agora + ligadoMs_;
    }
  }

 private:
  bool continuo_ = false;
  bool tocando_ = false;
  uint8_t restantes_ = 0;
  uint16_t ligadoMs_ = 0, desligadoMs_ = 0;
  unsigned long proximaTroca_ = 0;

  void ligar(bool sim) {
    tocando_ = sim;
    digitalWrite(PINO_BUZZER, sim ? HIGH : LOW);
  }
};

// LED único: apagado, aceso ou piscando (devagar = bloqueado, rápido = alarme).
enum class ModoLed : uint8_t { APAGADO, ACESO, PISCA_DEVAGAR, PISCA_RAPIDO };

class LedStatus {
 public:
  void iniciar() { pinMode(PINO_LED, OUTPUT); }

  void atualizar(ModoLed modo, unsigned long agora) {
    bool aceso;
    switch (modo) {
      case ModoLed::ACESO: aceso = true; break;
      case ModoLed::PISCA_DEVAGAR: aceso = (agora / 500) % 2; break;
      case ModoLed::PISCA_RAPIDO: aceso = (agora / 120) % 2; break;
      default: aceso = false;
    }
    digitalWrite(PINO_LED, aceso ? HIGH : LOW);
  }
};
