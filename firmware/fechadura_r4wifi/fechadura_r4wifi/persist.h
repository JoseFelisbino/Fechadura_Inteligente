#pragma once
// Layout da EEPROM (emulada na data flash do RA4M1, 8 KB).
// Só bytes alterados são regravados (EEPROM.update), para poupar a flash.

#include <Arduino.h>
#include <EEPROM.h>
#include <stddef.h>
#include "config.h"

#define PERSIST_MAGIC 0x46524134UL  // "FRA4"
#define PERSIST_VERSION 1

struct PinSlotRecord {
  uint8_t used;
  char name[PIN_NAME_MAX + 1];
  uint8_t hash[32];
};

struct PersistLayout {
  uint32_t magic;
  uint8_t version;
  uint8_t failedAttempts;
  uint8_t lockedOut;
  uint8_t alarmState;  // 0 = desarmado, 1 = armado, 2 = disparado (sobrevive a reinício)
  uint32_t bootCount;
  uint16_t doorClosedMaxCm;
  uint16_t windowClosedMaxCm;
  uint8_t salt[16];
  PinSlotRecord slots[PIN_SLOTS];
};

#define PERSIST_OFFSET(field) offsetof(PersistLayout, field)

namespace persist {

template <typename T>
inline void save(size_t offset, const T &value) {
  const uint8_t *p = reinterpret_cast<const uint8_t *>(&value);
  for (size_t i = 0; i < sizeof(T); i++) EEPROM.update((int)(offset + i), p[i]);
}

inline void saveBytes(size_t offset, const void *data, size_t len) {
  const uint8_t *p = static_cast<const uint8_t *>(data);
  for (size_t i = 0; i < len; i++) EEPROM.update((int)(offset + i), p[i]);
}

template <typename T>
inline void load(size_t offset, T &value) {
  uint8_t *p = reinterpret_cast<uint8_t *>(&value);
  for (size_t i = 0; i < sizeof(T); i++) p[i] = EEPROM.read((int)(offset + i));
}

inline void loadBytes(size_t offset, void *data, size_t len) {
  uint8_t *p = static_cast<uint8_t *>(data);
  for (size_t i = 0; i < len; i++) p[i] = EEPROM.read((int)(offset + i));
}

inline size_t slotOffset(uint8_t slot) { return PERSIST_OFFSET(slots) + slot * sizeof(PinSlotRecord); }

}  // namespace persist

// Zera memória sem que o compilador remova a escrita.
inline void secureZero(void *p, size_t len) {
  volatile uint8_t *v = static_cast<volatile uint8_t *>(p);
  while (len--) *v++ = 0;
}
