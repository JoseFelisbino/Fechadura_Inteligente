#pragma once
// Travas (2 micro servos SG90) e buzzer, sem delay(): tudo avança em update(millis()).

#include <Arduino.h>
#include <Servo.h>
#include "config.h"

// ======================================================================= Travas
// Nunca move os dois servos ao mesmo tempo (pico de corrente no 5V da placa): os pedidos
// ficam pendentes e são executados um de cada vez, cada um com SERVO_MOVE_MS reservados.
// No boot os dois vão para SERVO_LOCKED_DEG (fail-secure).
class LockServos {
 public:
  void begin() {
    pins_[0] = SERVO_MAIN_PIN;
    pins_[1] = SERVO_BACK_PIN;
    for (uint8_t i = 0; i < 2; i++) {
      target_[i] = false;
      applied_ = 0;  // força o movimento inicial dos dois
      needsMove_[i] = true;
    }
  }

  void unlock(uint8_t i, unsigned long ms) {
    if (i > 1) return;
    target_[i] = true;
    durationMs_[i] = ms;
    unlockAt_[i] = millis();  // reajustado quando o servo realmente se move
    if (!isApplied(i, true)) needsMove_[i] = true;
  }

  void lock(uint8_t i) {
    if (i > 1) return;
    target_[i] = false;
    if (!isApplied(i, false)) needsMove_[i] = true;
  }

  void update(unsigned long now) {
    for (uint8_t i = 0; i < 2; i++) {
      if (target_[i] && !needsMove_[i] && now - unlockAt_[i] >= durationMs_[i]) lock(i);
    }

    if (moving_ >= 0) {
      if (now - moveStartedAt_ < SERVO_MOVE_MS) return;
#if SERVO_DETACH_AFTER_MOVE
      servo_[moving_].detach();
#endif
      moving_ = -1;
    }

    for (uint8_t i = 0; i < 2; i++) {  // porta principal tem prioridade
      if (!needsMove_[i]) continue;
      int angle = target_[i] ? SERVO_UNLOCKED_DEG : SERVO_LOCKED_DEG;
      if (!servo_[i].attached()) {
        servo_[i].write(angle);
        servo_[i].attach(pins_[i]);
      }
      servo_[i].write(angle);
      setApplied(i, target_[i]);
      needsMove_[i] = false;
      if (target_[i]) unlockAt_[i] = now;
      moving_ = i;
      moveStartedAt_ = now;
      break;
    }
  }

  bool isUnlocked(uint8_t i) const { return i <= 1 && (target_[i] || isApplied(i, true)); }
  bool anyUnlocked() const { return isUnlocked(0) || isUnlocked(1); }
  // Há movimento em andamento ou trava aberta: não é hora de bloquear o loop com a rede.
  bool busy() const { return moving_ >= 0 || needsMove_[0] || needsMove_[1] || anyUnlocked(); }

 private:
  Servo servo_[2];
  uint8_t pins_[2] = {0, 0};
  bool target_[2] = {false, false};
  bool needsMove_[2] = {true, true};
  uint8_t applied_ = 0;  // bit i = servo i está na posição "liberada"
  unsigned long unlockAt_[2] = {0, 0};
  unsigned long durationMs_[2] = {UNLOCK_MS, UNLOCK_MS};
  int8_t moving_ = -1;
  unsigned long moveStartedAt_ = 0;

  bool isApplied(uint8_t i, bool unlocked) const { return (((applied_ >> i) & 1) != 0) == unlocked; }
  void setApplied(uint8_t i, bool unlocked) {
    if (unlocked) applied_ |= (1 << i);
    else applied_ &= ~(1 << i);
  }
};

// ======================================================================= Buzzer
// Ativo (nível alto liga) ou passivo (tone) conforme BUZZER_PASSIVE em config.h.
// A sirene do alarme tem prioridade sobre os bipes e para sozinha após ALARM_SIREN_MAX_MS.
class Buzzer {
 public:
  void begin() {
    pinMode(BUZZER_PIN, OUTPUT);
    hwOff();
  }

  // count bipes de onMs com intervalo offMs. Ignorado enquanto a sirene toca.
  void beep(uint8_t count, uint16_t onMs, uint16_t offMs = 120) {
    if (siren_) return;
    count_ = count;
    onMs_ = onMs;
    offMs_ = offMs;
    startPattern();
  }

  void siren(unsigned long maxMs) {
    siren_ = true;
    sirenUntil_ = millis() + maxMs;
    count_ = 0;
    hwOn();
  }

  void silence() {
    siren_ = false;
    count_ = 0;
    hwOff();
  }

  bool sirenOn() const { return siren_; }

  void update(unsigned long now) {
    if (siren_) {
      if ((long)(now - sirenUntil_) >= 0) silence();
      return;
    }
    if (count_ == 0) return;
    if ((long)(now - nextAt_) < 0) return;
    if (on_) {
      hwOff();
      if (--count_ == 0) return;
      nextAt_ = now + offMs_;
    } else {
      hwOn();
      nextAt_ = now + onMs_;
    }
  }

 private:
  bool siren_ = false;
  unsigned long sirenUntil_ = 0;
  uint8_t count_ = 0;
  uint16_t onMs_ = 0, offMs_ = 0;
  bool on_ = false;
  unsigned long nextAt_ = 0;

  void startPattern() {
    hwOn();
    nextAt_ = millis() + onMs_;
  }

  void hwOn() {
    on_ = true;
#ifdef BUZZER_PASSIVE
    tone(BUZZER_PIN, BUZZER_TONE_HZ);
#else
    digitalWrite(BUZZER_PIN, HIGH);
#endif
  }

  void hwOff() {
    on_ = false;
#ifdef BUZZER_PASSIVE
    noTone(BUZZER_PIN);
#else
    digitalWrite(BUZZER_PIN, LOW);
#endif
  }
};
