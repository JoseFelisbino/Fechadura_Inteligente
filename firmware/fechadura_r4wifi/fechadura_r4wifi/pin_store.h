#pragma once
// Até PIN_SLOTS senhas, cada uma com um nome (para o histórico registrar quem entrou).
// Na EEPROM ficam somente o nome e o hash (SHA-256 iterado com salt). O PIN nunca é gravado.
//
// Um único salt por dispositivo: a senha digitada é "hasheada" UMA vez e comparada, em tempo
// constante, com todos os slots. Por isso dois slots não podem ter a mesma senha (o que, de
// qualquer forma, impediria saber quem entrou).

#include <Arduino.h>
#include <SHA256.h>
#include "config.h"
#include "persist.h"

enum class PinResult : uint8_t { Ok, InvalidSlot, InvalidName, InvalidPin, Duplicate, LastPin };

class PinStore {
 public:
  // Carrega os slots. Se a EEPROM estiver vazia, gera o salt e grava a senha inicial no slot 0.
  void begin(bool freshEeprom, const char *initialPin, const char *initialName, const char *entropySeed) {
    if (freshEeprom) {
      generateSalt(entropySeed);
      persist::saveBytes(PERSIST_OFFSET(salt), salt_, sizeof(salt_));
      PinSlotRecord empty = {};
      for (uint8_t i = 0; i < PIN_SLOTS; i++) persist::save(persist::slotOffset(i), empty);
    }
    persist::loadBytes(PERSIST_OFFSET(salt), salt_, sizeof(salt_));
    for (uint8_t i = 0; i < PIN_SLOTS; i++) {
      persist::load(persist::slotOffset(i), slots_[i]);
      slots_[i].name[PIN_NAME_MAX] = '\0';
      if (slots_[i].used != 1) slots_[i].used = 0;
    }

    unsigned long t0 = millis();
    uint8_t probe[32];
    hash("0000", probe);
    secureZero(probe, sizeof(probe));
    hashMs_ = millis() - t0;

    if (usedCount() == 0) {
      setSlot(0, initialName, initialPin);
      Serial.println(F("[pin] Senha inicial gravada como hash no slot 0."));
    }
  }

  // Retorna o slot da senha (0..PIN_SLOTS-1) ou -1. Compara todos os slots (tempo constante).
  int8_t verify(const char *pin) {
    if (!isValidPin(pin)) return -1;
    uint8_t digest[32];
    hash(pin, digest);
    int8_t found = -1;
    for (uint8_t s = 0; s < PIN_SLOTS; s++) {
      uint8_t diff = 0;
      for (uint8_t i = 0; i < 32; i++) diff |= slots_[s].hash[i] ^ digest[i];
      bool match = (diff == 0) && slots_[s].used;
      if (match && found < 0) found = (int8_t)s;
    }
    secureZero(digest, sizeof(digest));
    return found;
  }

  PinResult setSlot(uint8_t slot, const char *name, const char *pin) {
    if (slot >= PIN_SLOTS) return PinResult::InvalidSlot;
    size_t nameLen = name ? strlen(name) : 0;
    if (nameLen == 0 || nameLen > PIN_NAME_MAX) return PinResult::InvalidName;
    if (!isValidPin(pin)) return PinResult::InvalidPin;

    uint8_t digest[32];
    hash(pin, digest);
    for (uint8_t s = 0; s < PIN_SLOTS; s++) {
      if (s == slot || !slots_[s].used) continue;
      if (memcmp(slots_[s].hash, digest, 32) == 0) {
        secureZero(digest, sizeof(digest));
        return PinResult::Duplicate;
      }
    }
    PinSlotRecord rec = {};
    rec.used = 1;
    strncpy(rec.name, name, PIN_NAME_MAX);
    memcpy(rec.hash, digest, 32);
    secureZero(digest, sizeof(digest));
    persist::save(persist::slotOffset(slot), rec);
    slots_[slot] = rec;
    secureZero(&rec, sizeof(rec));
    return PinResult::Ok;
  }

  PinResult deleteSlot(uint8_t slot) {
    if (slot >= PIN_SLOTS) return PinResult::InvalidSlot;
    if (!slots_[slot].used) return PinResult::Ok;  // idempotente
    if (usedCount() <= 1) return PinResult::LastPin;  // nunca deixa a fechadura sem senha
    PinSlotRecord empty = {};
    persist::save(persist::slotOffset(slot), empty);
    slots_[slot] = empty;
    return PinResult::Ok;
  }

  const char *name(int8_t slot) const {
    if (slot < 0 || slot >= PIN_SLOTS || !slots_[slot].used) return nullptr;
    return slots_[slot].name;
  }

  uint8_t usedCount() const {
    uint8_t n = 0;
    for (uint8_t i = 0; i < PIN_SLOTS; i++) n += slots_[i].used ? 1 : 0;
    return n;
  }

  unsigned long hashMs() const { return hashMs_; }

  static bool isValidPin(const char *pin) {
    if (!pin) return false;
    size_t len = strlen(pin);
    if (len < PIN_MIN_LEN || len > PIN_MAX_LEN) return false;
    for (size_t i = 0; i < len; i++) {
      if (pin[i] < '0' || pin[i] > '9') return false;
    }
    return true;
  }

 private:
  uint8_t salt_[16] = {};
  PinSlotRecord slots_[PIN_SLOTS] = {};
  unsigned long hashMs_ = 0;

  void hash(const char *pin, uint8_t *out) {
    SHA256 sha;
    sha.reset();
    sha.update(salt_, sizeof(salt_));
    sha.update(pin, strlen(pin));
    sha.finalize(out, 32);
    for (int i = 1; i < PIN_HASH_ROUNDS; i++) {
      sha.reset();
      sha.update(salt_, sizeof(salt_));
      sha.update(out, 32);
      sha.finalize(out, 32);
    }
    sha.clear();
  }

  // O RA4M1 não expõe um gerador aleatório na API Arduino. O salt só precisa ser único:
  // mistura o DEVICE_ID (único por instalação) com ruído das entradas analógicas e o jitter de micros().
  void generateSalt(const char *seed) {
    SHA256 sha;
    sha.reset();
    if (seed) sha.update(seed, strlen(seed));
    for (int round = 0; round < 64; round++) {
      uint32_t noise = micros();
      for (uint8_t a = 0; a < 6; a++) noise = (noise << 5) ^ (noise >> 27) ^ (uint32_t)analogRead(A0 + a);
      sha.update(&noise, sizeof(noise));
      delayMicroseconds(97 + (noise & 0x3F));
    }
    uint8_t digest[32];
    sha.finalize(digest, 32);
    memcpy(salt_, digest, sizeof(salt_));
    secureZero(digest, sizeof(digest));
    sha.clear();
  }
};
