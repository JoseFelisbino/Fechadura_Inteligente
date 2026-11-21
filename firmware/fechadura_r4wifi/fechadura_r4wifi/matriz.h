#pragma once
// =============================================================================
// matriz.h — ícones na matriz de LEDs 12x8 embutida no Uno R4 WiFi
// renderBitmap() só copia o desenho; quem acende os LEDs é uma interrupção da placa.
// Por isso desenhar não trava o loop. Só redesenha quando a tela muda.
// =============================================================================

#include <Arduino.h>
#include <Arduino_LED_Matrix.h>

enum class Tela : uint8_t { OCIOSO, DIGITANDO, DIGITANDO_SAIDA, LIBERADO, NEGADO, BLOQUEADO, NAO_FECHOU, ALARME };

namespace icones {
// Cada ícone tem 8 linhas de 12 colunas. '#' = LED aceso.
static const char *const CADEADO[8] = {
    "....####....", "...#....#...", "...#....#...", "..########..",
    "..###..###..", "..###..###..", "..########..", "..########..",
};
static const char *const CERTO[8] = {
    "............", "..........#.", ".........##.", "........##..",
    ".#.....##...", ".##...##....", "..##.##.....", "...###......",
};
static const char *const ERRADO[8] = {
    "..#......#..", "...#....#...", "....#..#....", ".....##.....",
    ".....##.....", "....#..#....", "...#....#...", "..#......#..",
};
static const char *const PORTA_ALERTA[8] = {  // porta + ponto de exclamação
    "#####.....#.", "#...#.....#.", "#...#.....#.", "#..##.....#.",
    "#...#.....#.", "#...#.......", "#...#.....#.", "#####.......",
};
static const char *const ALERTA[8] = {  // triângulo com "!"
    ".....##.....", "....#..#....", "....#..#....", "...#.##.#...",
    "...#.##.#...", "..#......#..", "..#..##..#..", ".##########.",
};
static const char *const CADEADO_PEQUENO[8] = {".##.", "#..#", "#..#", "####", "####", "####", "####", "####"};
// Algarismos de 3x5 para a contagem regressiva do bloqueio.
static const char *const DIGITOS[10][5] = {
    {"###", "#.#", "#.#", "#.#", "###"}, {".#.", "##.", ".#.", ".#.", "###"}, {"###", "..#", "###", "#..", "###"},
    {"###", "..#", "###", "..#", "###"}, {"#.#", "#.#", "###", "..#", "..#"}, {"###", "#..", "###", "..#", "###"},
    {"###", "#..", "###", "#.#", "###"}, {"###", "..#", ".#.", ".#.", ".#."}, {"###", "#.#", "###", "#.#", "###"},
    {"###", "#.#", "###", "..#", "###"},
};
}  // namespace icones

class Matriz {
 public:
  void iniciar() { matriz_.begin(); }

  // valor: quantos dígitos foram digitados (DIGITANDO) ou segundos restantes (BLOQUEADO).
  // piscaAceso: fase do pisca-pisca das telas de aviso.
  void mostrar(Tela tela, uint8_t valor, bool piscaAceso) {
    if (tela == tela_ && valor == valor_ && piscaAceso == pisca_ && desenhou_) return;
    tela_ = tela;
    valor_ = valor;
    pisca_ = piscaAceso;
    desenhou_ = true;
    desenhar();
    matriz_.renderBitmap(quadro_, 8, 12);
  }

 private:
  ArduinoLEDMatrix matriz_;
  uint8_t quadro_[8][12] = {};
  Tela tela_ = Tela::OCIOSO;
  uint8_t valor_ = 0;
  bool pisca_ = false;
  bool desenhou_ = false;

  void copiar(const char *const *linhas, uint8_t altura, uint8_t x0, uint8_t y0) {
    for (uint8_t l = 0; l < altura && y0 + l < 8; l++) {
      for (uint8_t c = 0; linhas[l][c] && x0 + c < 12; c++) {
        if (linhas[l][c] == '#') quadro_[y0 + l][x0 + c] = 1;
      }
    }
  }

  // Um quadradinho 1x2 por dígito digitado (a senha em si nunca aparece).
  void pontos(uint8_t quantidade, uint8_t y) {
    for (uint8_t i = 0; i < quantidade && i < 8; i++) {
      quadro_[y][2 + i] = 1;
      quadro_[y + 1][2 + i] = 1;
    }
  }

  void desenhar() {
    memset(quadro_, 0, sizeof(quadro_));
    switch (tela_) {
      case Tela::OCIOSO: copiar(icones::CADEADO, 8, 0, 0); break;
      case Tela::DIGITANDO: pontos(valor_, 3); break;
      case Tela::DIGITANDO_SAIDA:  // seta "saindo" no topo + pontos
        quadro_[0][8] = 1;
        for (uint8_t c = 2; c <= 9; c++) quadro_[1][c] = 1;
        quadro_[2][8] = 1;
        pontos(valor_, 5);
        break;
      case Tela::LIBERADO: copiar(icones::CERTO, 8, 0, 0); break;
      case Tela::NEGADO: copiar(icones::ERRADO, 8, 0, 0); break;
      case Tela::BLOQUEADO: {
        uint8_t s = valor_ > 99 ? 99 : valor_;
        copiar(icones::CADEADO_PEQUENO, 8, 0, 0);
        copiar(icones::DIGITOS[s / 10], 5, 5, 2);
        copiar(icones::DIGITOS[s % 10], 5, 9, 2);
        break;
      }
      case Tela::NAO_FECHOU:
        if (pisca_) copiar(icones::PORTA_ALERTA, 8, 0, 0);
        break;
      case Tela::ALARME:
        if (pisca_) copiar(icones::ALERTA, 8, 0, 0);
        break;
    }
  }
};
