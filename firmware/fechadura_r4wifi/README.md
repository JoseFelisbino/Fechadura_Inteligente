# Firmware — Arduino Uno R4 WiFi

Fechadura com teclado 4x4, 2 travas por micro servo, 2 sensores ultrassônicos (porta e janela),
buzzer, 2 LEDs e a matriz de LEDs 12x8 da placa. Tudo o que envolve segurança roda localmente,
sem Wi-Fi, broker ou backend.

## Compilar e gravar

**PlatformIO** (nesta pasta):

```bash
cp fechadura_r4wifi/secrets.example.h fechadura_r4wifi/secrets.h   # preencha
pio run                 # compila
pio run -t upload       # grava
pio device monitor      # Serial a 115200
```

**Arduino IDE 2.x**:

1. *Boards Manager* → instale **Arduino UNO R4 Boards** (núcleo `renesas_uno`).
2. *Library Manager* → instale **Keypad** (Mark Stanley/Alexander Brevig), **MQTT** (Joel Gaehwiler / 256dpi),
   **ArduinoJson** (Benoit Blanchon, 7.x), **Crypto** (Rhys Weatherley) e **Servo** (Arduino, 1.2.2+).
   `WiFiS3`, `Arduino_LED_Matrix`, `EEPROM` e `RTC` já vêm com o núcleo.
3. Abra `fechadura_r4wifi/fechadura_r4wifi.ino`. Os arquivos `app.cpp` e `.h` aparecem como abas.
4. Copie `secrets.example.h` para `secrets.h` na mesma pasta e preencha.
5. Placa **Arduino UNO R4 WiFi** → *Upload*.

`secrets.h` não deve ser versionado nem compartilhado (está no `.gitignore`).

## Ligações

| Pino | Ligação |
|---|---|
| D9, D8, D7, D6 | Teclado: linhas 1 a 4 |
| D5, D4, D3, D2 | Teclado: colunas 1 a 4 |
| D10 | Servo 1 (porta principal), fio laranja/amarelo |
| D11 | Servo 2 (porta dos fundos), fio laranja/amarelo |
| D12 | Botão de saída (o outro terminal no GND; usa `INPUT_PULLUP`) |
| D13 | Buzzer (+). D13 também acende o LED "L" da placa |
| A0 / A1 | Ultrassônico 1 (porta): TRIG / ECHO |
| A2 / A3 | Ultrassônico 2 (janela): TRIG / ECHO |
| A4 | LED "trava liberada" → resistor de 220 Ω → GND |
| A5 | LED "alarme" → resistor de 220 Ω → GND |
| 5V / GND | Trilhos da protoboard: servos (vermelho/marrom), VCC/GND dos HC-SR04, buzzer (−) |

```text
                      Arduino Uno R4 WiFi
                 ┌──────────────────────────────┐
  Teclado L1..L4 ┤ D9 D8 D7 D6                  │
  Teclado C1..C4 ┤ D5 D4 D3 D2                  │
  Servo porta    ┤ D10                      A0 ├── TRIG ┐ HC-SR04 #1
  Servo fundos   ┤ D11                      A1 ├── ECHO ┘ (porta)
  Botão saída ───┤ D12 ──[botão]── GND      A2 ├── TRIG ┐ HC-SR04 #2
  Buzzer (+) ────┤ D13                      A3 ├── ECHO ┘ (janela)
                 │                          A4 ├──[220Ω]──▶|── GND  LED trava
                 │                          A5 ├──[220Ω]──▶|── GND  LED alarme
                 │  5V ───────┬───────────┬────────┬──────────┐
                 │  GND ──────┼──┬────────┼──┬─────┼──┬───────┼──┐
                 └────────────┼──┼────────┼──┼─────┼──┼───────┼──┼─
                          servo1 │    servo2 │  HC-SR04 x2  buzzer (−)
                          (V+)  (GND)  (V+) (GND)  (VCC/GND)
```

> ⚠️ **Alimentação dos servos.** Um SG90 puxa até ~650 mA travado. Pela USB, o 5V da placa entrega
> por volta de 500 mA. O firmware nunca move os dois ao mesmo tempo e desliga o sinal após o
> movimento, mas, se a placa reiniciar ao mover um servo, alimente os servos com uma fonte 5V
> externa (GND comum com a placa).

O HC-SR04 trabalha em 5 V e o RA4M1 aceita 5 V nas entradas, então não é preciso divisor no ECHO.

## Uso do teclado

| Tecla | Função |
|---|---|
| senha + `#` | **Entrada**: libera a porta principal por 5 s (`UNLOCK_MS`) e desarma o alarme |
| `D` + senha + `#` | **Saída** pelo teclado (enquanto não houver o botão no D12) |
| `*` | Limpa a digitação |
| `A`, `B`, `C` | Sem função |

A digitação é descartada após 10 s sem teclas. A troca de senha pelo teclado foi removida: as
senhas (até 5, cada uma com um nome) são gerenciadas pelo app, que envia `SET_PIN`/`DELETE_PIN`.
No primeiro boot, o slot 0 recebe `INITIAL_LOCK_PIN` do `secrets.h`.

## Comportamento

- **Bloqueio**: 3 senhas erradas seguidas → 60 s sem aceitar nenhuma tecla, buzzer por 3 s e
  contagem regressiva na matriz. Fica salvo na EEPROM e é retomado após reiniciar. O botão de
  saída (lado de dentro) continua funcionando.
- **Saída com checagem**: se a janela estiver aberta ou sem leitura, a saída **não** é liberada:
  a matriz pisca o ícone da janela, o buzzer dá 3 bipes e é enviado `EXIT_BLOCKED`.
- **Alarme**: depois de uma saída liberada, quando a porta abre e fecha (em até 2 min) o alarme
  arma (`ALARM_ARMED`). Armado: janela abrindo, ou porta abrindo sem liberação válida, dispara a
  sirene (`ALARM_TRIGGERED`, LED de alarme piscando). A sirene para sozinha após 3 min; o alarme
  continua disparado até uma senha válida ou `DISARM` pelo app. O estado do alarme sobrevive a
  reinício (desligar a placa não desarma). Janela sem leitura (sem eco) com o alarme armado não
  dispara: só gera o evento de sensor `UNKNOWN`.
- **Direção**: teclado (senha + `#`) = `ENTRY`; botão ou `D` + senha = `EXIT`.
- **Porta aberta há mais de 60 s**: 2 bipes a cada 10 s e ícone da porta piscando. O alerta
  oficial (`OPEN_TOO_LONG`) continua sendo do backend, conforme `maxOpenSeconds`.

### Matriz de LEDs

| Ícone | Situação |
|---|---|
| Casa | Ocioso |
| Pontos (1 por dígito) | Digitando; com seta no topo = saída |
| ✓ | Liberado |
| ✗ | Senha errada |
| Cadeado + segundos | Bloqueado |
| Janela piscando | Saída recusada: feche a janela |
| Escudo piscando / fixo | Armando (aguardando a porta fechar) / alarme armado |
| Sino piscando | Alarme disparado |
| Porta piscando | Porta aberta há tempo demais |

### Sensores ultrassônicos

Os dois são disparados alternadamente a cada 60 ms. Cada estado vem da mediana de 3 leituras,
com histerese de 3 cm e duas medianas seguidas para confirmar a mudança (~0,7 s). Fechado =
distância ≤ limite (`DOOR_CLOSED_MAX_CM`/`WINDOW_CLOSED_MAX_CM`, padrão 8 cm, ajustável pelo app
com `SET_THRESHOLD` e salvo na EEPROM). Se o ECHO nem chegar a subir (sensor desligado ou mal
ligado), o estado vira `UNKNOWN` e nunca "fechado". Sem objeto até 2 m conta como aberto.

## Rede

- **WiFiS3 + MQTT** (`256dpi/MQTT`, QoS 1). Cada evento só sai da fila (64 eventos em RAM) após o
  PUBACK. Ao reconectar, o dispositivo reenvia a fila, publica o heartbeat e o estado dos sensores.
- **Bloqueio do loop**: `WiFi.begin()` e o `connect` do MQTT travam o loop por alguns segundos
  (o tempo real aparece no Serial: `bloqueou N ms`). Por isso só são tentados a cada 30 s (Wi-Fi)
  e 15 s (MQTT), com o teclado ocioso há 3 s e nenhuma trava aberta. Durante esse tempo, teclas não
  são lidas; a sirene, se ativa, continua tocando.
- **Horário**: `WiFi.getTime()` (NTP do módulo) e RTC do R4, que continua contando após um reset.
  Sem horário válido, os eventos saem sem `occurredAt` e o backend usa `receivedAt`.
- **Comandos** (`home/devices/{id}/commands`, resposta em `.../commands/ack`): `UNLOCK`, `LOCK`,
  `ARM`, `DISARM`, `SILENCE_BUZZER`, `BUZZER_TEST`, `SET_PIN`, `DELETE_PIN`, `SET_THRESHOLD`,
  `SNAPSHOT`. `commandId` repetido não é executado de novo (o mesmo ack é reenviado). Com horário
  válido, comando vencido recebe `EXPIRED`. `UNLOCK` é recusado durante um bloqueio por senhas
  erradas (`REMOTE_UNLOCK_DURING_LOCKOUT 0`). O PIN de `SET_PIN` é lido direto do texto recebido
  (não passa pelo ArduinoJson), vira hash e é apagado da RAM. O buffer interno da biblioteca MQTT
  é reaproveitado pelo próximo pacote, mas não é zerado: para o PIN não trafegar em claro, use TLS.
