#pragma once
// Fila circular de eventos mantida em RAM enquanto não há conexão.
// Cada evento é guardado em forma compacta (~24 bytes) e o JSON só é montado no envio,
// o que permite 64 eventos nos 32 KB de RAM do RA4M1. Quando cheia, descarta o mais antigo.

#include <Arduino.h>
#include "config.h"

enum class EventKind : uint8_t { Access, Sensor };

enum class AccessType : uint8_t {
  AccessGranted,
  AccessDenied,
  LockoutStarted,
  LockoutEnded,
  LockReleased,
  ExitBlocked,
  AlarmArmed,
  AlarmDisarmed,
  AlarmTriggered,
  RemoteUnlock,
  RemoteLock,
  PinChanged,
};

enum class Direction : uint8_t { Unknown, Entry, Exit };
enum class Source : uint8_t { None, Keypad, ExitButton, App, System };
enum class LockId : uint8_t { Main = 0, Back = 1, None = 0xFF };
enum class Reading : uint8_t { Unknown, Open, Closed };
enum class SlotAction : uint8_t { None, Set, Delete };

#define NO_DISTANCE 0xFFFF
#define POINT_DOOR_BIT 0x01
#define POINT_WINDOW_BIT 0x02

struct QueuedEvent {
  uint32_t seq;
  uint32_t epoch;  // 0 = sem horário confiável (o backend usa receivedAt)
  uint16_t ms;
  EventKind kind;
  uint8_t type;       // AccessType (Access) ou índice do sensor (Sensor)
  uint8_t value;      // Direction (Access) ou Reading (Sensor)
  Source source;
  int8_t slot;        // -1 = sem slot
  LockId lock;
  uint8_t attempt;
  uint8_t pointMask;  // pontos abertos (EXIT_BLOCKED) ou ponto que disparou (ALARM_TRIGGERED)
  SlotAction slotAction;
  uint16_t distanceCm;
  uint16_t extra;     // lockoutSeconds ou pulseMs
};

class EventQueue {
 public:
  void push(const QueuedEvent &evt) {
    if (count_ == EVENT_QUEUE_CAPACITY) {
      head_ = (head_ + 1) % EVENT_QUEUE_CAPACITY;
      count_--;
      dropped_++;
    }
    items_[(head_ + count_) % EVENT_QUEUE_CAPACITY] = evt;
    count_++;
  }

  // O evento só sai da fila após a confirmação (PUBACK) do broker.
  bool peek(QueuedEvent &out) const {
    if (count_ == 0) return false;
    out = items_[head_];
    return true;
  }

  void pop() {
    if (count_ == 0) return;
    head_ = (head_ + 1) % EVENT_QUEUE_CAPACITY;
    count_--;
  }

  uint16_t size() const { return count_; }
  uint32_t dropped() const { return dropped_; }

 private:
  QueuedEvent items_[EVENT_QUEUE_CAPACITY];
  uint16_t head_ = 0;
  uint16_t count_ = 0;
  uint32_t dropped_ = 0;
};
