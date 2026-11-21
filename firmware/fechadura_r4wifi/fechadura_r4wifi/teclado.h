#pragma once
// =============================================================================
// teclado.h — leitura do teclado de membrana 4x4 (sem biblioteca)
//
// Por que não usar a biblioteca Keypad? Ela foi feita para as placas AVR: no Uno R4 ela troca o
// pinMode(INPUT_PULLUP) do programa inteiro por uma "imitação" que NÃO liga o pull-up. Com isso
// os pinos ficam soltos e aparecem teclas fantasmas.
//
// Como funciona a varredura:
//   - as 4 linhas ficam como entrada com pull-up (leem 1 quando nada está apertado);
//   - uma coluna por vez é ligada em 0 V; se uma linha passar a ler 0, a tecla do cruzamento
//     daquela linha com aquela coluna está apertada;
//   - a tecla só vale depois de aparecer igual em 2 varreduras seguidas (debounce de ~20 ms) e é
//     informada uma única vez por toque.
// =============================================================================

#include <Arduino.h>
#include "config.h"

class Teclado {
 public:
  void iniciar() {
    for (uint8_t i = 0; i < 4; i++) {
      pinMode(PINOS_LINHAS[i], INPUT_PULLUP);
      pinMode(PINOS_COLUNAS[i], INPUT);  // coluna "desligada" = entrada (não puxa nada)
    }
  }

  // Retorna a tecla recém-apertada ou 0 se nada mudou. Chamar em todo loop.
  char ler(unsigned long agora) {
    if (agora - ultimaVarredura_ < 10) return 0;
    ultimaVarredura_ = agora;

    char atual = varrer();
    if (atual != candidata_) {  // mudou: espera confirmar na próxima varredura
      candidata_ = atual;
      return 0;
    }
    if (atual == confirmada_) return 0;
    confirmada_ = atual;
    return atual;  // 0 quando a tecla foi solta
  }

 private:
  const char mapa_[4][4] = {
      {'1', '2', '3', 'A'},
      {'4', '5', '6', 'B'},
      {'7', '8', '9', 'C'},
      {'*', '0', '#', 'D'},
  };
  unsigned long ultimaVarredura_ = 0;
  char candidata_ = 0;
  char confirmada_ = 0;

  char varrer() {
    char achada = 0;
    for (uint8_t c = 0; c < 4 && !achada; c++) {
      pinMode(PINOS_COLUNAS[c], OUTPUT);
      digitalWrite(PINOS_COLUNAS[c], LOW);
      delayMicroseconds(10);  // tempo para o sinal estabilizar
      for (uint8_t l = 0; l < 4; l++) {
        if (digitalRead(PINOS_LINHAS[l]) == LOW) {
          achada = mapa_[l][c];
          break;
        }
      }
      pinMode(PINOS_COLUNAS[c], INPUT);
    }
    return achada;
  }
};
