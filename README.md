# Fechadura Inteligente

Projeto Integrador **Automação Residencial Inteligente com IoT** (Sistemas de Informação, UNIBAVE),
Trilha C: Segurança e Acesso Inteligente.

Fechadura com senha num **Arduino Uno R4 WiFi**: teclado 4x4, micro servo fazendo o papel da porta,
sensor ultrassônico que confirma se a porta fechou, buzzer, LED e a matriz de LEDs da placa. Os eventos
vão por **MQTT** para um backend que guarda o histórico no **PostgreSQL**, e um **PWA** mostra tudo em tempo
real e permite comandar a fechadura pelo celular.

> Protótipo de demonstração: não tem login nem perfis, e as senhas do teclado ficam em texto puro.
> Use só na rede local.

```text
.
├── firmware/fechadura_r4wifi/  Sketch do Uno R4 WiFi (Arduino IDE ou PlatformIO)
├── backend/                    API (Node.js, TypeScript, Express, Prisma, PostgreSQL, MQTT, SSE)
├── frontend/                   PWA (React, Vite, vite-plugin-pwa, recharts)
├── mosquitto/                  Configuração do broker MQTT
├── docs/ROTEIRO_DEMO.md        Roteiro do pitch (5 minutos)
└── docker-compose.yml          PostgreSQL + Mosquitto
```

## Como funciona

```text
 Teclado ─┐                                 ┌──────────── PWA (celular) ────────────┐
 Botão  ──┤   Uno R4 WiFi                   │ Início · Senhas · Gráficos · Histórico │
 HC-SR04 ─┤   (decide TUDO localmente)      │ Alertas · Ajustes                      │
          │   servo · buzzer · LED · matriz └──────────────▲─────────────────────────┘
          │            │ Wi-Fi (WiFiS3)          REST + SSE │ /api (proxy do Vite)
          │            ▼                                    │
          │      Mosquitto (MQTT) ◄────────────► Backend (Express) ──► PostgreSQL
```

- **A segurança fica no Arduino.** Senha, bloqueio, saída e alarme funcionam sem Wi-Fi. Sem rede, os
  eventos ficam numa fila (20 em RAM) e são enviados quando a conexão volta.
- **Tópicos MQTT:** `fechadura/eventos`, `fechadura/estado` (a cada 2 s), `fechadura/status` (testamento
  LWT), `fechadura/comandos` e `fechadura/comandos/resposta`. Os formatos estão em
  [firmware/fechadura_r4wifi/README.md](firmware/fechadura_r4wifi/README.md) e em `backend/src/validators/index.ts`.
- **Backend:** grava eventos (sem duplicar quando o Arduino reenvia), leituras (no máximo 1 a cada 5 s,
  guardadas por 24 h), senhas, comandos (expiram em 15 s sem resposta), alertas e ajustes.
- **Alertas** (um por ocorrência): `PORTA_FORCADA` (resolvido ao desligar o alarme), `PORTA_NAO_FECHOU`
  (resolvido quando a porta fecha), `ABERTA_DEMAIS` (porta aberta mais que o tempo máximo, padrão 30 s) e
  `OFFLINE` (15 s sem estado, ou o testamento do broker).
- **PWA:** tempo real por SSE. Se o SSE cair, recarrega a cada 5 s. Sem conexão, mostra a última leitura
  com o aviso "sem conexão" e desativa os botões.

## Pré-requisitos

- Node.js 20+ e Docker Desktop
- Arduino IDE 2.x (ou PlatformIO) para gravar a placa

## Como rodar

### 1. Banco e broker (docker compose)

```bash
cp backend/.env.example backend/.env       # preencha MQTT_PASSWORD (12+ caracteres)
cd backend && npm install
npm run mqtt:user                          # cria o usuário do broker em mosquitto/config/passwd
cd ..
docker compose up -d                       # PostgreSQL + Mosquitto
```

Se a porta 5432 já estiver ocupada por outro PostgreSQL, crie um `.env` na raiz com
`POSTGRES_HOST_PORT=5434` e use a mesma porta no `DATABASE_URL` do `backend/.env`.

### 2. Backend

```bash
cd backend
npx prisma migrate deploy   # cria as tabelas
npm run seed                # ajustes padrão + senha do slot 1 (Admin / 1234, a mesma do firmware)
npm run dev                 # API em http://localhost:3000/api
npm test                    # testes (usam o schema do DATABASE_URL_TEST)
```

### 3. App (PWA)

```bash
cd frontend
npm install
npm run dev                 # http://localhost:5173
```

O app chama `/api` na mesma origem e o Vite repassa para o backend (`API_PROXY_TARGET`, padrão
`http://localhost:3000`). Se o seu `frontend/.env` tiver `VITE_API_URL`, apague essa linha: com ela o
celular tentaria chamar o `localhost` dele mesmo.

### 4. Sem o Arduino: modo simulação

```bash
cd backend
npm run simular             # estados a cada 2 s, cenas aleatórias e respostas aos comandos
npm run simular -- --calmo  # só responde aos comandos
```

Não rode o simulador com a placa ligada: os dois usam os mesmos tópicos.

### 5. Arduino

Veja [firmware/fechadura_r4wifi/README.md](firmware/fechadura_r4wifi/README.md). Em resumo: instale a placa
**Arduino UNO R4 Boards** e as bibliotecas **Servo**, **MQTT** (Joel Gaehwiler) e **ArduinoJson**.
Depois copie `secrets.example.h` para `secrets.h` e preencha o Wi-Fi (2,4 GHz), o IP do computador que roda
o Mosquitto e o mesmo usuário e senha MQTT do `backend/.env`.

## Abrir e instalar no celular

O service worker (que permite instalar o app) só funciona em `localhost` ou em **HTTPS**. Duas formas:

**A) Túnel HTTPS (mais simples, não instala nada no celular)**

```bash
cd frontend
npm run celular                                    # build + vite preview na porta 4173
cloudflared tunnel --url http://localhost:4173     # em outro terminal
```

Abra no celular o endereço `https://….trycloudflare.com` que aparece. O endereço muda a cada execução.

**B) Rede local com certificado (mkcert)**

```bash
mkcert -install                                    # cria a CA local (uma vez)
mkdir frontend/certs
mkcert -cert-file frontend/certs/cert.pem -key-file frontend/certs/key.pem 192.168.0.10 localhost
cd frontend && npm run celular                     # agora em https://192.168.0.10:4173
```

Troque `192.168.0.10` pelo IP do computador. O celular precisa confiar na CA: copie o `rootCA.pem`
(`mkcert -CAROOT` mostra onde está) e instale em Configurações → Segurança → Certificados (Android) ou
Ajustes → Geral → Perfil (iPhone, depois ative em Sobre → Confiança de Certificados).

**Instalar:** no Chrome do Android, menu ⋮ → **Instalar app** (ou o botão em Ajustes). No iPhone (Safari):
Compartilhar → **Adicionar à Tela de Início**.

## Montagem (ligações)

| Pino | Peça | Função |
|---|---|---|
| D9, D8, D7, D6 | Teclado 4x4: linhas 1 a 4 | Senha |
| D5, D4, D3, D2 | Teclado 4x4: colunas 1 a 4 | |
| D10 | Servo SG90 (sinal) | A porta: 0° fechada/trancada, 90° aberta |
| A0 / A1 | HC-SR04: TRIG / ECHO | Porta fechada (perto) ou aberta (longe) |
| D13 | Buzzer | Bipes, bloqueio e alarme |
| A4 | LED + resistor de 220 Ω | Status |
| D12 | Botão de saída (opcional) → GND | Saída pelo lado de dentro |
| — | Matriz de LEDs 12x8 da placa | Ícones de status |

## Roteiro de teste do hardware

Abra o Monitor Serial (115200). Todos os eventos aparecem lá. `s` mostra o estado, `u` testa o ultrassônico,
`t` testa LED/buzzer/matriz/servo e `k` mostra as teclas apertadas.

1. **Boot:** o servo vai a 0°, a matriz mostra o cadeado e o LED fica apagado.
2. **Sensor:** com a porta encostada, `u` deve mostrar poucos cm (≤ 10). Afaste a mão: a distância sobe.
   "sem eco" = confira VCC/GND do sensor e os fios em A0/A1.
3. **Senha certa:** `1 2 3 4 #` → servo a 90°, ✓ na matriz, LED aceso, 1 bipe. Depois de 5 s volta a 0°.
4. **`*`:** digite alguns números e aperte `*`: os pontinhos somem.
5. **Senha errada:** `9 9 9 9 #` → ✗ e 2 bipes. Repita 3 vezes → cadeado com contagem de 30 s, LED piscando
   devagar e bipe a cada segundo. Durante o bloqueio, o teclado não responde.
6. **Saída:** `D 1 2 3 4 #` (ou o botão D12) → a porta abre. No histórico aparece como saída.
7. **Porta não fechou:** abra com a senha e segure a mão na frente do sensor (longe) até o servo voltar →
   3 bipes e a porta com "!" na matriz.
8. **Porta forçada:** com a porta fechada e o servo em 0°, afaste o anteparo do sensor → buzzer contínuo,
   LED piscando rápido e triângulo na matriz. Digite a senha para desligar.
9. **Sem Wi-Fi:** desligue o roteador (ou o broker) e repita os passos 3 e 5: tudo continua funcionando.
   Ao reconectar, os eventos aparecem no histórico do app.

## Requisitos do professor

| Requisito | Onde |
|---|---|
| Camada 1: 2 sensores distintos + atuadores | Teclado 4x4 e ultrassônico HC-SR04; servo, buzzer, LED e matriz de LEDs |
| Camada 2: comunicação sem fio | WiFiS3 + MQTT (Mosquitto) |
| Camada 3: histórico persistente | PostgreSQL (eventos, leituras, comandos, alertas) via Prisma |
| Camada 4: dashboard responsivo, gráficos em tempo real e acionamento remoto | PWA: gráficos de distância (ao vivo) e de acessos por hora; abrir/fechar porta, desligar alarme e testar buzzer |
| Resiliência | Senha, bloqueio, saída e alarme rodam no Arduino; fila offline reenviada ao reconectar |
| Trilha C | Histórico de entrada/saída (teclado, botão, app), detecção de porta forçada, matriz de LEDs com o status |

## Testes

- `backend`: `npm test` (35 testes: eventos, comandos com resposta e expiração, senhas, alertas, estado,
  leituras e ajustes) e `npm run typecheck`
- `frontend`: `npm test` (14 testes) e `npm run typecheck`
- `firmware`: `pio run` (compila) ou *Verify* na Arduino IDE
