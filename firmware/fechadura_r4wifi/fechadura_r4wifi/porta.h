#pragma once
// =============================================================================
// porta.h — o servo (a porta) e o sensor ultrassônico que confirma se ela fechou
// Nada aqui usa delay(): tudo avança quando o loop chama atualizar(millis()).
// =============================================================================

#include <Arduino.h>
#include <Servo.h>
#include "config.h"

// ----------------------------------------------------------------------- Servo
class PortaServo {
 public:
  void iniciar() { mover(ANGULO_FECHADA); }  // ao ligar, a porta fica fechada (trancada)

  // Abre a porta por "duracaoMs" milissegundos. Chamar de novo com ela aberta renova o tempo.
  void abrir(unsigned long duracaoMs) {
    fecharEm_ = millis() + duracaoMs;
    if (!aberta_) {
      aberta_ = true;
      mover(ANGULO_ABERTA);
    }
  }

  void fechar() {
    if (!aberta_) return;
    aberta_ = false;
    mover(ANGULO_FECHADA);
    acabouDeFechar_ = true;
  }

  // Retorna true no instante em que a porta voltou para 0° (para conferir o sensor depois).
  bool atualizar(unsigned long agora) {
    if (aberta_ && (long)(agora - fecharEm_) >= 0) fechar();
    // Desliga o sinal depois do movimento: o SG90 para de tremer e de gastar corrente.
    if (servo_.attached() && agora - movidoEm_ >= TEMPO_MOVIMENTO_SERVO_MS) servo_.detach();
    bool fechou = acabouDeFechar_;
    acabouDeFechar_ = false;
    return fechou;
  }

  bool aberta() const { return aberta_; }                 // trava liberada (servo em 90°)
  bool movendo() const { return millis() - movidoEm_ < TEMPO_MOVIMENTO_SERVO_MS; }

 private:
  Servo servo_;
  bool aberta_ = false;
  bool acabouDeFechar_ = false;
  unsigned long fecharEm_ = 0;
  unsigned long movidoEm_ = 0;

  void mover(int angulo) {
    if (!servo_.attached()) servo_.attach(PINO_SERVO);
    servo_.write(angulo);
    movidoEm_ = millis();
  }
};

// ----------------------------------------------------------------------- Ultrassônico
enum class EstadoPorta : uint8_t { DESCONHECIDA, FECHADA, ABERTA };

static const char *nomeEstadoPorta(EstadoPorta e) {
  switch (e) {
    case EstadoPorta::FECHADA: return "FECHADA";
    case EstadoPorta::ABERTA: return "ABERTA";
    default: return "DESCONHECIDA";
  }
}

// HC-SR04: mede a distância até a porta. Perto = fechada; longe = aberta.
// Faz 1 disparo a cada INTERVALO_PING_MS e, a cada 3 disparos, usa a MEDIANA (descarta leituras
// malucas). O novo estado só vale depois de CONFIRMACOES medianas iguais seguidas.
class SensorPorta {
 public:
  static const int SEM_ECO = -1;   // o ECHO nem subiu: sensor desligado ou mal ligado
  static const int LONGE = 9999;   // o eco não voltou dentro de ALCANCE_MAX_CM

  void iniciar(uint16_t limiteCm) {
    limiteCm_ = limiteCm;
    pinMode(PINO_TRIG, OUTPUT);
    digitalWrite(PINO_TRIG, LOW);
    pinMode(PINO_ECHO, INPUT);
  }

  // Retorna true quando o estado (FECHADA / ABERTA / DESCONHECIDA) mudou.
  bool atualizar(unsigned long agora) {
    if (agora - ultimoPing_ < INTERVALO_PING_MS) return false;
    ultimoPing_ = agora;
    amostras_[n_++] = medir();
    if (n_ < 3) return false;
    n_ = 0;
    return avaliar(mediana(amostras_[0], amostras_[1], amostras_[2]));
  }

  // Um disparo isolado (diagnóstico pelo Serial). Retorna cm, SEM_ECO ou LONGE.
  int medir() {
    digitalWrite(PINO_TRIG, LOW);
    delayMicroseconds(2);
    digitalWrite(PINO_TRIG, HIGH);  // pulso de 10 us dispara o sensor
    delayMicroseconds(10);
    digitalWrite(PINO_TRIG, LOW);

    // Espera o ECHO subir (no máximo 3 ms) e mede quanto tempo ele fica em nível alto.
    unsigned long t0 = micros();
    while (digitalRead(PINO_ECHO) == LOW) {
      if (micros() - t0 > 3000UL) return SEM_ECO;
    }
    unsigned long inicio = micros();
    while (digitalRead(PINO_ECHO) == HIGH) {
      if (micros() - inicio > (unsigned long)ALCANCE_MAX_CM * 58UL) return LONGE;  // ~11,6 ms no pior caso
    }
    int cm = (int)((micros() - inicio) / 58UL);  // o som leva ~58 us para ir e voltar 1 cm
    return cm < 1 ? 1 : cm;
  }

  EstadoPorta estado() const { return estado_; }
  int distanciaCm() const { return distancia_; }  // -1 quando não há leitura válida
  uint16_t limiteCm() const { return limiteCm_; }
  void definirLimite(uint16_t cm) { limiteCm_ = cm; }

 private:
  uint16_t limiteCm_ = DOOR_CLOSED_MAX_CM;
  int amostras_[3] = {};
  uint8_t n_ = 0;
  unsigned long ultimoPing_ = 0;
  EstadoPorta estado_ = EstadoPorta::DESCONHECIDA;
  EstadoPorta candidato_ = EstadoPorta::DESCONHECIDA;
  uint8_t confirmacoes_ = 0;
  int distancia_ = -1;

  static int mediana(int a, int b, int c) {
    if ((a <= b && b <= c) || (c <= b && b <= a)) return b;
    if ((b <= a && a <= c) || (c <= a && a <= b)) return a;
    return c;
  }

  bool avaliar(int cm) {
    EstadoPorta novo;
    if (cm == SEM_ECO) {
      novo = EstadoPorta::DESCONHECIDA;
      distancia_ = -1;
    } else if (cm == LONGE) {
      novo = EstadoPorta::ABERTA;
      distancia_ = -1;
    } else {
      distancia_ = cm;
      if (cm <= (int)limiteCm_) novo = EstadoPorta::FECHADA;
      else if (cm > (int)limiteCm_ + HISTERESE_CM) novo = EstadoPorta::ABERTA;
      else novo = estado_ == EstadoPorta::DESCONHECIDA ? EstadoPorta::ABERTA : estado_;  // faixa de histerese
    }

    if (novo == estado_) {
      confirmacoes_ = 0;
      return false;
    }
    if (novo != candidato_) {
      candidato_ = novo;
      confirmacoes_ = 0;
    }
    if (++confirmacoes_ < CONFIRMACOES) return false;
    estado_ = novo;
    confirmacoes_ = 0;
    return true;
  }
};
