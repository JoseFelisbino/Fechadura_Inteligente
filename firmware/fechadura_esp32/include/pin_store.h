#pragma once
// Armazena a senha da fechadura somente como hash (SHA-256 iterado com salt) na NVS.

#include <Arduino.h>
#include <Preferences.h>
#include <esp_random.h>
#include <mbedtls/md.h>
#include "config.h"

class PinStore {
 public:
  void begin(Preferences *prefs, const char *initialPin) {
    prefs_ = prefs;
    if (prefs_->getBytesLength("hash") != 32 || prefs_->getBytesLength("salt") != 16) {
      // Primeiro boot: gera salt aleatório e salva o hash da senha inicial.
      setPin(initialPin);
      Serial.println(F("[lock] Senha inicial gravada como hash. Troque-a pelo teclado."));
    }
  }

  bool verify(const char *pin) {
    uint8_t salt[16], stored[32], computed[32];
    prefs_->getBytes("salt", salt, sizeof(salt));
    prefs_->getBytes("hash", stored, sizeof(stored));
    hash(pin, salt, computed);
    // Comparação em tempo constante.
    uint8_t diff = 0;
    for (int i = 0; i < 32; i++) diff |= stored[i] ^ computed[i];
    memset(computed, 0, sizeof(computed));
    return diff == 0;
  }

  void setPin(const char *pin) {
    uint8_t salt[16], digest[32];
    esp_fill_random(salt, sizeof(salt));
    hash(pin, salt, digest);
    prefs_->putBytes("salt", salt, sizeof(salt));
    prefs_->putBytes("hash", digest, sizeof(digest));
    memset(digest, 0, sizeof(digest));
  }

  static bool isValidPin(const char *pin) {
    size_t len = strlen(pin);
    if (len < PIN_MIN_LEN || len > PIN_MAX_LEN) return false;
    for (size_t i = 0; i < len; i++) {
      if (pin[i] < '0' || pin[i] > '9') return false;
    }
    return true;
  }

 private:
  Preferences *prefs_ = nullptr;

  static void hash(const char *pin, const uint8_t *salt, uint8_t *out) {
    const mbedtls_md_info_t *info = mbedtls_md_info_from_type(MBEDTLS_MD_SHA256);
    mbedtls_md_context_t ctx;
    mbedtls_md_init(&ctx);
    mbedtls_md_setup(&ctx, info, 0);
    mbedtls_md_starts(&ctx);
    mbedtls_md_update(&ctx, salt, 16);
    mbedtls_md_update(&ctx, (const uint8_t *)pin, strlen(pin));
    mbedtls_md_finish(&ctx, out);
    for (int i = 1; i < PIN_HASH_ROUNDS; i++) {
      mbedtls_md_starts(&ctx);
      mbedtls_md_update(&ctx, salt, 16);
      mbedtls_md_update(&ctx, out, 32);
      mbedtls_md_finish(&ctx, out);
    }
    mbedtls_md_free(&ctx);
  }
};
