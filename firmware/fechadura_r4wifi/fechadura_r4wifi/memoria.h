#pragma once
// =============================================================================
// memoria.h — senhas e ajustes salvos na EEPROM do R4
// As senhas ficam em texto puro: aceitável porque é só um protótipo de demonstração.
// =============================================================================

#include <Arduino.h>
#include <EEPROM.h>
#include "config.h"

#define MARCA_MEMORIA 0x46533031UL  // "FS01": indica que a EEPROM já foi inicializada

struct SlotSenha {
  uint8_t ativo;              // 1 = slot em uso
  char nome[NOME_MAX + 1];
  char senha[SENHA_MAX + 1];
};

struct Memoria {
  uint32_t marca;
  uint32_t boots;             // quantas vezes a placa ligou (entra no id dos eventos)
  uint32_t tempoAberturaMs;
  uint16_t limiteFechadaCm;
  SlotSenha slots[NUM_SENHAS];
};

static Memoria memoria;

static void memoriaSalvar() { EEPROM.put(0, memoria); }

// Lê a EEPROM. No primeiro boot grava os valores padrão de config.h.
static void memoriaCarregar() {
  EEPROM.get(0, memoria);
  if (memoria.marca != MARCA_MEMORIA) {
    memset(&memoria, 0, sizeof(memoria));
    memoria.marca = MARCA_MEMORIA;
    memoria.tempoAberturaMs = OPEN_MS;
    memoria.limiteFechadaCm = DOOR_CLOSED_MAX_CM;
    memoria.slots[0].ativo = 1;
    strncpy(memoria.slots[0].nome, NOME_PADRAO, NOME_MAX);
    strncpy(memoria.slots[0].senha, SENHA_PADRAO, SENHA_MAX);
    Serial.println("[memoria] primeiro boot: senha padrao gravada no slot 1");
  }
  memoria.boots++;
  memoriaSalvar();
}

// Senha válida = de SENHA_MIN a SENHA_MAX dígitos (0 a 9).
static bool senhaValida(const char *senha) {
  size_t n = strlen(senha);
  if (n < SENHA_MIN || n > SENHA_MAX) return false;
  for (size_t i = 0; i < n; i++) {
    if (senha[i] < '0' || senha[i] > '9') return false;
  }
  return true;
}

// Procura a senha digitada. Retorna o índice do slot (0 a 2) ou -1 se nenhuma bater.
static int senhaConferir(const char *digitada) {
  for (int i = 0; i < NUM_SENHAS; i++) {
    if (memoria.slots[i].ativo && strcmp(memoria.slots[i].senha, digitada) == 0) return i;
  }
  return -1;
}

// slot de 1 a 3. Retorna nullptr se deu certo ou o motivo da recusa.
static const char *senhaDefinir(int slot, const char *nome, const char *senha) {
  if (slot < 1 || slot > NUM_SENHAS) return "SLOT_INVALIDO";
  if (!senhaValida(senha)) return "SENHA_INVALIDA";
  if (!nome || nome[0] == '\0') return "NOME_INVALIDO";
  for (int i = 0; i < NUM_SENHAS; i++) {  // duas pessoas com a mesma senha: não daria para saber quem entrou
    if (i != slot - 1 && memoria.slots[i].ativo && strcmp(memoria.slots[i].senha, senha) == 0) return "SENHA_DUPLICADA";
  }
  SlotSenha &s = memoria.slots[slot - 1];
  memset(&s, 0, sizeof(s));
  s.ativo = 1;
  strncpy(s.nome, nome, NOME_MAX);
  strncpy(s.senha, senha, SENHA_MAX);
  memoriaSalvar();
  return nullptr;
}

static const char *senhaRemover(int slot) {
  if (slot < 1 || slot > NUM_SENHAS) return "SLOT_INVALIDO";
  memset(&memoria.slots[slot - 1], 0, sizeof(SlotSenha));
  memoriaSalvar();
  return nullptr;
}
