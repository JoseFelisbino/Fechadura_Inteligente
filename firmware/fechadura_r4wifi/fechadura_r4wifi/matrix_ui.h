#pragma once
// Ícones na matriz de LEDs 12x8 do Uno R4 WiFi. renderBitmap() só copia o quadro; a varredura
// é feita por interrupção, então desenhar não trava o loop. Só redesenha quando algo muda.

#include <Arduino.h>
#include <Arduino_LED_Matrix.h>

enum class Screen : uint8_t {
  Idle,
  Typing,
  ExitTyping,
  Granted,
  Denied,
  Lockout,
  CloseWindow,
  Alarm,
  Armed,
  Arming,
  DoorOpenWarn,
  Blank,
};

namespace icons {
// 8 linhas x 12 colunas. '#' = aceso.
static const char *const HOUSE[8] = {
    ".....##.....", "....####....", "...######...", "..########..",
    "...#....#...", "...#.##.#...", "...#.##.#...", "...######...",
};
static const char *const CHECK[8] = {
    "............", "..........#.", ".........##.", "........##..",
    ".#.....##...", ".##...##....", "..##.##.....", "...###......",
};
static const char *const CROSS[8] = {
    "..#......#..", "...#....#...", "....#..#....", ".....##.....",
    ".....##.....", "....#..#....", "...#....#...", "..#......#..",
};
static const char *const WINDOW[8] = {
    "..#########.", "..#...#...#.", "..#...#...#.", "..#########.",
    "..#...#...#.", "..#...#...#.", "..#########.", "............",
};
static const char *const BELL[8] = {
    ".....##.....", "....####....", "....####....", "....####....",
    "...######...", "..########..", "............", ".....##.....",
};
static const char *const SHIELD[8] = {
    "..########..", "..#......#..", "..#..##..#..", "..#..##..#..",
    "..#......#..", "...#....#...", "....#..#....", ".....##.....",
};
static const char *const DOOR[8] = {
    "...######...", "...#....#...", "...#....#...", "...#..#.#...",
    "...#....#...", "...#....#...", "...#....#...", "...######...",
};
static const char *const PADLOCK[8] = {".##.", "#..#", "#..#", "####", "####", "####", "####", "####"};

// Dígitos 3x5.
static const char *const DIGITS[10][5] = {
    {"###", "#.#", "#.#", "#.#", "###"}, {".#.", "##.", ".#.", ".#.", "###"}, {"###", "..#", "###", "#..", "###"},
    {"###", "..#", "###", "..#", "###"}, {"#.#", "#.#", "###", "..#", "..#"}, {"###", "#..", "###", "..#", "###"},
    {"###", "#..", "###", "#.#", "###"}, {"###", "..#", ".#.", ".#.", ".#."}, {"###", "#.#", "###", "#.#", "###"},
    {"###", "#.#", "###", "..#", "###"},
};
}  // namespace icons

class MatrixUi {
 public:
  void begin() {
    matrix_.begin();
    show(Screen::Idle, 0, true);
  }

  // param: dígitos digitados (Typing/ExitTyping) ou segundos restantes (Lockout).
  // blinkOn: fase do pisca para as telas que piscam.
  void show(Screen screen, uint8_t param, bool blinkOn) {
    if (screen == screen_ && param == param_ && blinkOn == blink_) return;
    screen_ = screen;
    param_ = param;
    blink_ = blinkOn;
    draw();
    matrix_.renderBitmap(frame_, 8, 12);
  }

 private:
  ArduinoLEDMatrix matrix_;
  uint8_t frame_[8][12] = {};
  Screen screen_ = Screen::Blank;
  uint8_t param_ = 0xFF;
  bool blink_ = false;

  void clear() { memset(frame_, 0, sizeof(frame_)); }

  void blit(const char *const *rows, uint8_t height, uint8_t x0, uint8_t y0) {
    for (uint8_t r = 0; r < height && y0 + r < 8; r++) {
      for (uint8_t c = 0; rows[r][c] && x0 + c < 12; c++) {
        if (rows[r][c] == '#') frame_[y0 + r][x0 + c] = 1;
      }
    }
  }

  void dots(uint8_t count, uint8_t y) {
    for (uint8_t i = 0; i < count && i < 8; i++) {
      frame_[y][2 + i] = 1;
      frame_[y + 1][2 + i] = 1;
    }
  }

  void draw() {
    clear();
    switch (screen_) {
      case Screen::Idle: blit(icons::HOUSE, 8, 0, 0); break;
      case Screen::Typing: dots(param_, 3); break;
      case Screen::ExitTyping:
        frame_[0][8] = 1;  // seta "saída" no topo
        for (uint8_t c = 2; c <= 9; c++) frame_[1][c] = 1;
        frame_[2][8] = 1;
        dots(param_, 5);
        break;
      case Screen::Granted: blit(icons::CHECK, 8, 0, 0); break;
      case Screen::Denied: blit(icons::CROSS, 8, 0, 0); break;
      case Screen::Lockout: {
        blit(icons::PADLOCK, 8, 0, 0);
        uint8_t secs = param_ > 99 ? 99 : param_;
        blit(icons::DIGITS[secs / 10], 5, 5, 2);
        blit(icons::DIGITS[secs % 10], 5, 9, 2);
        break;
      }
      case Screen::CloseWindow:
        if (blink_) blit(icons::WINDOW, 8, 0, 0);
        break;
      case Screen::Alarm:
        if (blink_) blit(icons::BELL, 8, 0, 0);
        break;
      case Screen::Armed: blit(icons::SHIELD, 8, 0, 0); break;
      case Screen::Arming:
        if (blink_) blit(icons::SHIELD, 8, 0, 0);
        break;
      case Screen::DoorOpenWarn:
        if (blink_) blit(icons::DOOR, 8, 0, 0);
        break;
      case Screen::Blank: break;
    }
  }
};
