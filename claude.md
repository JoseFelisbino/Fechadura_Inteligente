# Claude.md — Fechadura Inteligente (escopo simplificado)

## Visão geral

Projeto Integrador "Automação Residencial Inteligente com IoT" (Sistemas de Informação, UNIBAVE),
Trilha C: Segurança e Acesso Inteligente.

**Escopo atual:** uma única fechadura com senha + um sensor na porta. Não existem janelas, vários pontos
monitorados, segunda porta, login, perfis de usuário nem provisionamento de dispositivos. É um **protótipo
de demonstração** para a apresentação, usado na rede local.

## Hardware real (não mudar os pinos)

Arduino **Uno R4 WiFi** (RA4M1 + ESP32-S3 para Wi-Fi via `WiFiS3`, matriz de LEDs 12x8 embutida).

| Pino | Peça |
|---|---|
| D9, D8, D7, D6 / D5, D4, D3, D2 | Teclado 4x4: linhas / colunas |
| D10 | Servo SG90 = a porta (0° fechada/trancada, 90° aberta) |
| A0 / A1 | HC-SR04 TRIG / ECHO |
| D13 | Buzzer |
| A4 | 1 LED (220 Ω) |
| D12 | Botão de saída (INPUT_PULLUP, opcional) |

Não há relé, solenoide, sensor magnético, display nem segundo LED.

## Estrutura

```text
firmware/fechadura_r4wifi/   sketch (Arduino IDE) + platformio.ini
backend/                     Express + Prisma + PostgreSQL + MQTT + SSE (sem autenticação)
frontend/                    PWA React + Vite (vite-plugin-pwa, recharts), sem login
mosquitto/                   broker com um único usuário (backend, Arduino e simulador)
docs/ROTEIRO_DEMO.md         pitch de 5 minutos
```

## Regras que não podem quebrar

1. **Senha, bloqueio, saída e alarme são decididos no Arduino** e funcionam sem Wi-Fi, broker ou backend.
2. Nada de `delay()` longo no firmware: tudo com `millis()`. `WiFi.begin()` e `mqtt.connect()` bloqueiam,
   então só rodam com a fechadura ociosa e espaçados (Wi-Fi a cada 30 s).
3. Eventos têm `id` único (`DEVICE_ID-boot-sequência`); o backend ignora repetidos.
4. Sem rede, o Arduino guarda os últimos 20 eventos em RAM e envia ao reconectar.
5. Um alerta ATIVO por tipo (índice único parcial na migration).
6. Senhas em texto puro e API sem autenticação são **aceitáveis só porque é demonstração**. Não publicar na
   internet. Segredos (Wi-Fi, MQTT) ficam em `secrets.h` e `.env`, fora do Git.

## Firmware — comportamento

- Senha + `#` = entrada; `D` + senha + `#` = saída pelo teclado; botão D12 = saída sem senha; `*` limpa;
  a digitação expira em 10 s.
- Porta abre por `OPEN_MS` (5 s, ajustável pelo app). 3 erros → bloqueio de 30 s.
- Sensor: mediana de 3 leituras a cada ~200 ms; fechada se ≤ `DOOR_CLOSED_MAX_CM` (10 cm, ajustável).
  Sem eco = DESCONHECIDA (nunca dispara alarme).
- 1,5 s após o servo voltar a 0°, se o sensor ainda vê aberta → `PORTA_NAO_FECHOU`.
- Servo em 0° e o sensor passa de FECHADA para ABERTA → alarme + `PORTA_FORCADA`; desliga com senha ou app.
- Até 3 senhas (slots 1–3, nome + senha) na EEPROM. Primeiro boot: slot 1 = Admin / 1234.

## MQTT

| Tópico | Direção | Conteúdo |
|---|---|---|
| `fechadura/eventos` | Arduino → backend | `{ id, tipo, origem, usuario?, timestamp? }` |
| `fechadura/estado` | Arduino → backend (2 s) | `{ trava, porta, distanciaCm, bloqueado, alarme, online }` |
| `fechadura/status` | retain + LWT | `{ online }` |
| `fechadura/comandos` | backend → Arduino | `{ id, tipo, params? }` |
| `fechadura/comandos/resposta` | Arduino → backend | `{ id, ok, motivo? }` |

Tipos de evento: `ACESSO_LIBERADO`, `SENHA_INCORRETA`, `BLOQUEIO_INICIO`, `BLOQUEIO_FIM`, `PORTA_ABERTA`,
`PORTA_FECHADA`, `PORTA_NAO_FECHOU`, `PORTA_FORCADA`, `ALARME_DESLIGADO`, `SENHA_ALTERADA`.
Origens: `TECLADO` (entrada), `TECLADO_SAIDA`, `BOTAO_SAIDA`, `APP`, `SENSOR`, `SISTEMA`.
Comandos: `ABRIR_PORTA`, `FECHAR_PORTA`, `DESLIGAR_ALARME`, `TESTAR_BUZZER`, `DEFINIR_SENHA`
(`{ slot, nome, senha }`), `REMOVER_SENHA` (`{ slot }`), `DEFINIR_CONFIG` (`{ tempoAberturaMs, limiteCm }`),
`ENVIAR_ESTADO`.

## Backend

- Modelos: `Evento`, `Leitura` (máx. 1 a cada 5 s, apagadas após 24 h), `Senha`, `Comando` (expira em 15 s),
  `Alerta` (`PORTA_FORCADA`, `PORTA_NAO_FECHOU`, `ABERTA_DEMAIS`, `OFFLINE`, `SENHAS_INCORRETAS` — aberto
  no `BLOQUEIO_INICIO`, só o app resolve), `Configuracao` (linha única).
- O estado atual fica em memória (`estado.service.ts`); 15 s sem estado = offline + alerta.
- Rotas: `GET /api/estado`, `GET /api/eventos`, `GET /api/eventos/por-hora`, `GET /api/leituras`,
  `GET /api/alertas`, `PATCH /api/alertas/:id/resolver`, `GET/PUT/DELETE /api/senhas/:slot`,
  `POST /api/comandos`, `GET /api/comandos/:id`, `GET/PUT /api/configuracao`, `GET /api/stream` (SSE).
- `npm run simular` imita o Arduino no broker (não rodar junto com a placa).
- Testes com Vitest + Supertest num schema separado (`DATABASE_URL_TEST`); o MQTT é trocado por um
  transporte falso (`src/mqtt/transporte.ts`).

## Frontend (PWA)

- Telas: Início, Senhas, Gráficos, Histórico, Alertas e Ajustes (ícone de engrenagem no topo).
- Chama `/api` na mesma origem (proxy do Vite), para o celular só precisar de um endereço HTTPS.
- SSE com recarga a cada 5 s se cair; sem conexão, mostra a última leitura (localStorage) e desativa botões.
- Service worker: cache só do app shell; `/api` sempre pela rede.
- Cada `SENHA_INCORRETA` recente (≤ 60 s) mostra uma faixa vermelha no topo de qualquer tela (some em 10 s,
  conta as seguidas) e também notifica.
- Notificação do navegador para alerta novo (vem pelo SSE, então só com o app aberto); liga em Ajustes,
  preferência no localStorage (`src/utils/notificacoes.ts`). Não há Web Push.

## Forma de trabalhar

- Rodar `npm test` e `npm run typecheck` (backend e frontend) e `pio run` (firmware) antes de entregar.
- Código e comentários em português, simples, porque o grupo explica o código na apresentação.
