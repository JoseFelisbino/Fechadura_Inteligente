#pragma once
// HC-SR04 usado como sensor de abertura: mede a distância até a folha da porta/janela.
//
// * Um disparo por chamada de ping(); o loop alterna os sensores a cada ULTRA_INTERVAL_MS
//   (nunca dois ao mesmo tempo, para um não captar o eco do outro).
// * Mediana de ULTRA_SAMPLES leituras, histerese e debounce.
// * Distingue FALHA (o ECHO nem sobe: sensor desligado/mal ligado) de LONGE (o ECHO sobe, mas o
//   eco não volta dentro de ULTRA_MAX_CM). Falha repetida => Unknown, que nunca vira "fechado".
//   Longe => aberto.
// * Tempo máximo bloqueado por disparo: ULTRA_ECHO_START_US + ULTRA_MAX_CM * 58 us (~15 ms).

#include <Arduino.h>
#include "config.h"
#include "event_queue.h"

class Ultrasonic {
 public:
  static const uint16_t SAMPLE_FAULT = 0;
  static const uint16_t SAMPLE_FAR = ULTRA_MAX_CM + 1;

  void begin(uint8_t trigPin, uint8_t echoPin, uint16_t closedMaxCm) {
    trig_ = trigPin;
    echo_ = echoPin;
    closedMaxCm_ = closedMaxCm;
    pinMode(trig_, OUTPUT);
    digitalWrite(trig_, LOW);
    pinMode(echo_, INPUT);
  }

  // Faz um disparo. Retorna true quando o estado (Open/Closed/Unknown) mudou.
  bool ping() {
    samples_[sampleCount_++] = measure();
    if (sampleCount_ < ULTRA_SAMPLES) return false;
    sampleCount_ = 0;
    return evaluate();
  }

  // Diagnóstico: um disparo isolado, sem alterar o estado. Retorna cm, SAMPLE_FAULT ou SAMPLE_FAR.
  uint16_t rawMeasure() { return measure(); }
  bool echoHigh() const { return digitalRead(echo_) == HIGH; }

  Reading state() const { return state_; }
  // Última distância válida dentro do alcance, ou NO_DISTANCE.
  uint16_t distanceCm() const { return distanceCm_; }
  uint16_t closedMaxCm() const { return closedMaxCm_; }
  void setClosedMaxCm(uint16_t cm) { closedMaxCm_ = cm; }

 private:
  uint8_t trig_ = 0, echo_ = 0;
  uint16_t closedMaxCm_ = 8;
  uint16_t samples_[ULTRA_SAMPLES] = {};
  uint8_t sampleCount_ = 0;
  Reading state_ = Reading::Unknown;
  Reading pending_ = Reading::Unknown;
  uint8_t pendingCount_ = 0;
  uint8_t faultCount_ = 0;
  uint16_t distanceCm_ = NO_DISTANCE;

  uint16_t measure() {
    if (digitalRead(echo_) == HIGH) return SAMPLE_FAULT;  // ECHO preso em alto: fiação com problema
    digitalWrite(trig_, LOW);
    delayMicroseconds(2);
    digitalWrite(trig_, HIGH);
    delayMicroseconds(10);
    digitalWrite(trig_, LOW);

    unsigned long t0 = micros();
    while (digitalRead(echo_) == LOW) {
      if (micros() - t0 > ULTRA_ECHO_START_US) return SAMPLE_FAULT;
    }
    unsigned long start = micros();
    const unsigned long maxUs = (unsigned long)ULTRA_MAX_CM * 58UL;
    while (digitalRead(echo_) == HIGH) {
      if (micros() - start > maxUs) return SAMPLE_FAR;
    }
    uint16_t cm = (uint16_t)((micros() - start) / 58UL);
    return cm == 0 ? 1 : cm;
  }

  bool evaluate() {
    uint16_t valid[ULTRA_SAMPLES];
    uint8_t n = 0;
    for (uint8_t i = 0; i < ULTRA_SAMPLES; i++) {
      if (samples_[i] != SAMPLE_FAULT) valid[n++] = samples_[i];
    }

    if (n < 2) {  // maioria sem eco
      pendingCount_ = 0;
      distanceCm_ = NO_DISTANCE;
      if (faultCount_ < 255) faultCount_++;
      if (faultCount_ >= ULTRA_UNKNOWN_COUNT && state_ != Reading::Unknown) {
        state_ = Reading::Unknown;
        return true;
      }
      return false;
    }
    faultCount_ = 0;

    // Ordena (no máximo 3 itens) e pega a mediana; com 2 válidas, a maior (conservador: aberto).
    for (uint8_t i = 1; i < n; i++) {
      for (uint8_t j = i; j > 0 && valid[j - 1] > valid[j]; j--) {
        uint16_t t = valid[j];
        valid[j] = valid[j - 1];
        valid[j - 1] = t;
      }
    }
    uint16_t d = (n == 2) ? valid[1] : valid[n / 2];
    distanceCm_ = d > ULTRA_MAX_CM ? NO_DISTANCE : d;

    Reading candidate;
    if (d <= closedMaxCm_) {
      candidate = Reading::Closed;
    } else if (d > closedMaxCm_ + ULTRA_HYSTERESIS_CM) {
      candidate = Reading::Open;
    } else {
      // Faixa de histerese: mantém o estado; vindo de Unknown, assume aberto (nunca "fechado" por dúvida).
      candidate = state_ == Reading::Unknown ? Reading::Open : state_;
    }

    if (candidate == state_) {
      pendingCount_ = 0;
      return false;
    }
    if (candidate != pending_) {
      pending_ = candidate;
      pendingCount_ = 0;
    }
    if (++pendingCount_ >= ULTRA_DEBOUNCE_COUNT) {
      state_ = candidate;
      pendingCount_ = 0;
      return true;
    }
    return false;
  }
};
