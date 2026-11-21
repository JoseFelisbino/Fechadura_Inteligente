# Firmware — Arduino Uno R4 WiFi

Fechadura com senha e sensor de porta: teclado 4x4, micro servo (a porta), ultrassônico HC-SR04,
buzzer, 1 LED, botão de saída e a matriz de LEDs 12x8 da própria placa. Tudo o que envolve
segurança roda localmente, **sem Wi-Fi, broker nem backend**.

## Arquivos

| Arquivo | O que faz |
|---|---|
| `fechadura_r4wifi.ino` | `setup()`/`loop()` e as regras: senha, saída, bloqueio, alarme, comandos do app |
| `config.h` | Pinos, tempos e valores padrão (senha padrão, limite em cm) |
| `secrets.h` | Wi-Fi e broker (**não versionado**; copie de `secrets.example.h`) |
| `teclado.h` | Leitura do teclado 4x4 (sem biblioteca: a Keypad desliga os pull-ups no R4) |
| `memoria.h` | Senhas (3 slots com nome) e ajustes na EEPROM |
| `porta.h` | Servo (abre/fecha sem `delay`) e ultrassônico (mediana de 3 leituras) |
| `sinais.h` | Buzzer (bipes/alarme) e LED de status |
| `matriz.h` | Ícones da matriz de LEDs |
| `rede.h` | WiFiS3 + MQTT, fila offline de 20 eventos, horário por NTP |

## Compilar e gravar

**Arduino IDE 2.x**

1. *Boards Manager* → instale **Arduino UNO R4 Boards**.
2. *Library Manager* → instale:
   - **Servo** (Michael Margolis, Arduino)
   - **MQTT** (Joel Gaehwiler)
   - **ArduinoJson** (Benoit Blanchon, versão 7)

   `WiFiS3`, `Arduino_LED_Matrix` e `EEPROM` já vêm com a placa.
3. Copie `secrets.example.h` para `secrets.h` (mesma pasta) e preencha o Wi-Fi e o IP do broker.
   Enquanto o SSID for `minha-rede`, a rede fica desligada e a fechadura roda só no modo local.
4. Abra `fechadura_r4wifi/fechadura_r4wifi.ino`, escolha a placa **Arduino UNO R4 WiFi** e clique em *Upload*.

**PlatformIO** (nesta pasta): `pio run` compila, `pio run -t upload` grava e `pio device monitor` abre o Serial (115200).

## Ligações

| Pino | Peça |
|---|---|
| D9, D8, D7, D6 | Teclado: linhas 1 a 4 |
| D5, D4, D3, D2 | Teclado: colunas 1 a 4 |
| D10 | Servo SG90 (sinal). 0° = fechada, 90° = aberta |
| A0 / A1 | HC-SR04: TRIG / ECHO |
| D13 | Buzzer (+). O LED "L" da placa pisca junto |
| A4 | LED → resistor de 220 Ω → GND |
| D12 | Botão de saída → GND (opcional; usa `INPUT_PULLUP`) |
| 5V / GND | Servo (vermelho/marrom), VCC/GND do HC-SR04, buzzer (−) |

> **Atenção à protoboard:** em muitas, os trilhos + e − são cortados no meio. Se o ultrassônico ficar
> "sem eco", ligue o VCC e o GND dele direto nos pinos 5V e GND da placa.

> **Gravação no R4 WiFi:** se o upload der "No device found", aperte o RESET duas vezes rápido (o LED "L"
> fica "respirando") e grave de novo. Se não pegar, tire e recoloque o USB e repita o duplo RESET.

## Uso

| No teclado | Resultado |
|---|---|
| senha + `#` | **Entrada**: abre a porta por 5 s, ✓ na matriz, LED aceso, 1 bipe |
| `D` + senha + `#` | **Saída** pelo teclado |
| `*` | Apaga a digitação (que também expira após 10 s parada) |
| Botão D12 | **Saída** sem senha (o botão fica do lado de dentro) |

No primeiro boot, o slot 1 recebe a senha `1234` (nome "Admin"), definida em `config.h`. Depois,
as senhas são trocadas pelo app.

- **Senha errada**: ✗ e 2 bipes. **3 erros seguidos**: bloqueio de 30 s (teclado ignorado, LED piscando
  devagar, bipe a cada segundo, cadeado e contagem regressiva na matriz). O botão de saída continua funcionando.
- **Sensor**: leitura a cada ~200 ms (mediana de 3). Fechada se `distância ≤ 10 cm` (ajustável pelo app).
  Sem eco = `DESCONHECIDA`. Nada a menos de 2 m = aberta.
- **Porta não fechou**: 1,5 s depois de o servo voltar a 0°, se o sensor ainda vê a porta aberta → 3 bipes,
  porta com "!" piscando e evento `PORTA_NAO_FECHOU`.
- **Porta forçada**: servo em 0° e o sensor passa de fechada para aberta → **alarme** (buzzer contínuo, LED
  piscando rápido, triângulo piscando) e evento `PORTA_FORCADA`. Desliga com senha correta ou pelo app.

| Matriz | Situação |
|---|---|
| Cadeado | Trancada, tudo normal |
| Pontinhos (1 por dígito; com seta = saída) | Digitando |
| ✓ | Liberado (enquanto a porta estiver aberta) |
| ✗ | Senha errada |
| Cadeado pequeno + segundos | Bloqueado |
| Porta com "!" piscando | Porta não fechou |
| Triângulo com "!" piscando | Alarme |

| LED (A4) | Situação |
|---|---|
| Aceso | Porta liberada |
| Piscando devagar | Bloqueado |
| Piscando rápido | Alarme |
| Apagado | Trancada e normal |

## Rede

- `WiFi.begin()` trava o loop por alguns segundos. Por isso a conexão só é tentada a cada 30 s e com a
  fechadura ociosa (ninguém digitando há 3 s e porta fechada).
- Enquanto estiver sem conexão, os eventos ficam numa fila de 20 em RAM e são enviados ao reconectar. Um
  evento só sai da fila depois da confirmação do broker (QoS 1).
- O horário vem de `WiFi.getTime()` (NTP). Eventos de antes do NTP ganham o horário certo quando ele chega.
  Sem NTP, o backend usa a hora de recebimento.
- Comandos aceitos: `ABRIR_PORTA`, `FECHAR_PORTA`, `DESLIGAR_ALARME`, `TESTAR_BUZZER`, `DEFINIR_SENHA`,
  `REMOVER_SENHA`, `DEFINIR_CONFIG` (`tempoAberturaMs`, `limiteCm`) e `ENVIAR_ESTADO`. Comando com `id`
  repetido é ignorado.

## Diagnóstico pelo Serial (115200)

Todos os eventos aparecem no Serial. Comandos: `s` estado, `u` 5 leituras do ultrassônico, `t` testa LED, buzzer,
matriz e servo, `k` liga/desliga o eco das teclas (mostra os dígitos digitados: só para conferir a ligação).
"sem eco" significa que o pino ECHO nem subiu: confira o VCC/GND do sensor e os fios em A0/A1.
