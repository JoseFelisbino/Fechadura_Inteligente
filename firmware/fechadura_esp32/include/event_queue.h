#pragma once
// Fila circular de eventos (thread-safe) mantida em RAM enquanto não há conexão.
// Quando cheia, descarta o evento mais antigo e contabiliza a perda.

#include <Arduino.h>
#include <freertos/FreeRTOS.h>
#include <freertos/semphr.h>
#include "config.h"

enum class EventChannel : uint8_t { Access, Sensor, Status };

struct QueuedEvent {
  EventChannel channel;
  char payload[EVENT_PAYLOAD_MAX];
};

class EventQueue {
 public:
  void begin() { mutex_ = xSemaphoreCreateMutex(); }

  void push(EventChannel channel, const char *payload) {
    xSemaphoreTake(mutex_, portMAX_DELAY);
    if (count_ == EVENT_QUEUE_CAPACITY) {
      head_ = (head_ + 1) % EVENT_QUEUE_CAPACITY;  // descarta o mais antigo
      count_--;
      dropped_++;
    }
    size_t tail = (head_ + count_) % EVENT_QUEUE_CAPACITY;
    items_[tail].channel = channel;
    strlcpy(items_[tail].payload, payload, EVENT_PAYLOAD_MAX);
    count_++;
    xSemaphoreGive(mutex_);
  }

  // Copia o primeiro evento sem removê-lo (removido só após confirmação do broker).
  bool peek(QueuedEvent &out) {
    xSemaphoreTake(mutex_, portMAX_DELAY);
    bool ok = count_ > 0;
    if (ok) out = items_[head_];
    xSemaphoreGive(mutex_);
    return ok;
  }

  void pop() {
    xSemaphoreTake(mutex_, portMAX_DELAY);
    if (count_ > 0) {
      head_ = (head_ + 1) % EVENT_QUEUE_CAPACITY;
      count_--;
    }
    xSemaphoreGive(mutex_);
  }

  size_t size() {
    xSemaphoreTake(mutex_, portMAX_DELAY);
    size_t n = count_;
    xSemaphoreGive(mutex_);
    return n;
  }

  uint32_t dropped() const { return dropped_; }

 private:
  SemaphoreHandle_t mutex_ = nullptr;
  QueuedEvent items_[EVENT_QUEUE_CAPACITY];
  size_t head_ = 0;
  size_t count_ = 0;
  volatile uint32_t dropped_ = 0;
};
