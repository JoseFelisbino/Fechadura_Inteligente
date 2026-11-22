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
  `OFFLINE` (15 s sem estado, ou o testamento do broker) e `SENHAS_INCORRETAS` (teclado bloqueado por 3
  senhas erradas; fica ativo até ser resolvido no app).
- **PWA:** tempo real por SSE. Se o SSE cair, recarrega a cada 5 s. Sem conexão, mostra a última leitura
  com o aviso "sem conexão" e desativa os botões. Cada senha incorreta digitada aparece na hora numa faixa vermelha
  no topo do app. Em **Ajustes → Notificações** dá para ligar notificações
  do navegador para senhas incorretas e alertas novos (só com o app aberto, e o navegador exige HTTPS ou localhost).

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

O simulador (`backend/scripts/simular.ts`) se conecta ao Mosquitto **como se fosse a placa**: publica o
estado a cada 2 s, gera cenas aleatórias (acesso liberado, senha errada, porta aberta, porta forçada...) e
responde aos comandos do app (abrir porta, trocar senha etc.). Para o backend e o app não há diferença
entre ele e o Arduino.

**Ele não liga sozinho.** Sem a placa e sem o simulador, depois de 15 s o app mostra a fechadura
**Offline** (e abre o alerta `OFFLINE`).

1. Com o Mosquitto e o backend rodando (passos 1 e 2), abra outro terminal:

   ```bash
   cd backend
   npm run simular             # estados a cada 2 s, cenas aleatórias e respostas aos comandos
   npm run simular -- --calmo  # só responde aos comandos (bom para demonstrar passo a passo)
   ```

2. No app, a fechadura aparece **Online** em poucos segundos. O terminal mostra cada evento e comando.
3. Para parar, aperte **Ctrl+C** no terminal do simulador.

### 5. Arduino

Detalhes em [firmware/fechadura_r4wifi/README.md](firmware/fechadura_r4wifi/README.md).

1. Na Arduino IDE, instale a placa **Arduino UNO R4 Boards** e as bibliotecas **Servo**, **MQTT**
   (Joel Gaehwiler) e **ArduinoJson**.
2. Copie `firmware/fechadura_r4wifi/fechadura_r4wifi/secrets.example.h` para `secrets.h` (mesma pasta,
   fica fora do Git) e preencha:

   ```c
   #define WIFI_SSID "nome-do-wifi"                       // rede 2,4 GHz
   #define WIFI_PASSWORD "senha-do-wifi"
   #define MQTT_HOST "fechadurainteligente.duckdns.org"   // ou o IP do PC, ex.: "192.168.0.10"
   #define MQTT_PORT 1883
   #define MQTT_USER "backend"        // o mesmo MQTT_USERNAME do backend/.env
   #define MQTT_PASSWORD "..."        // o mesmo MQTT_PASSWORD do backend/.env
   ```

   Usando o nome do DuckDNS (seção C abaixo) em `MQTT_HOST`, não é preciso regravar a placa quando o IP do
   PC muda: basta atualizar o IP no DuckDNS. Se a placa não conectar pelo nome, use o IP.
3. Grave a placa (*Upload* na IDE ou `pio run -t upload`). Em até ~30 s o app mostra a fechadura **Online**
   com a distância real do sensor.

### Trocar do simulador para o Arduino

1. **Pare o simulador** (Ctrl+C). Os dois nunca podem rodar juntos: usam os mesmos tópicos e o app
   mostraria os dados misturados.
2. Ligue a placa já gravada (passo 5). Mosquitto e backend continuam como estão; nada muda no app.
3. Confira no app: **Online** e a distância mudando quando você mexe a mão na frente do sensor.

Para voltar ao simulador, desligue a placa (ou tire da tomada) e rode `npm run simular` de novo.

Se a placa não conectar ao broker, confira o Monitor Serial (115200) e o firewall do Windows: a porta
**1883** precisa aceitar conexões da rede local. Na primeira vez que o Docker Desktop roda, o Windows
pergunta: clique em **Permitir** (marcando também redes públicas).

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

**C) App na Vercel + API pela rede local (para várias pessoas instalarem)**

O app fica em `https://fechadura-inteligente.vercel.app` (qualquer um instala pelo link ou QR code) e
chama a API no PC por um nome do DuckDNS que aponta para o **IP local** do PC. A API continua acessível só
dentro do Wi-Fi.

1. Em [duckdns.org](https://www.duckdns.org), crie o subdomínio, coloque o IP local do PC em *current ip*
   (veja com `ipconfig`) e deixe *ipv6* vazio. Salve o token em `frontend/certs/duckdns-token.txt`.
2. Gere o certificado (Let's Encrypt, validação por DNS; instale o `lego` com `winget install GoACME.lego`):

   ```powershell
   $env:DUCKDNS_TOKEN = ((Get-Content frontend\certs\duckdns-token.txt -Raw).Trim() -replace '^token=', '')
   lego run --accept-tos --dns duckdns --dns.resolvers "1.1.1.1:53,8.8.8.8:53" `
     --domains fechadurainteligente.duckdns.org --path backend\certs\lego
   ```

   O certificado vale cerca de 90 dias. Para renovar, rode o mesmo comando e reinicie o backend.
3. No `backend/.env`, aponte `HTTPS_CERT_FILE` e `HTTPS_KEY_FILE` para os arquivos em
   `backend/certs/lego/certificates/` e rode `npm run dev`. A API passa a responder em
   `https://fechadurainteligente.duckdns.org:3000/api`.
4. Na Vercel, defina `VITE_API_URL=https://fechadurainteligente.duckdns.org:3000/api` e faça um novo deploy.

Se o PC mudar de rede, atualize o IP no DuckDNS (o certificado continua valendo). No primeiro acesso, o
Chrome pergunta se o site pode acessar a rede local: toque em **Permitir**. Com HTTPS ligado no backend, o
proxy do `npm run dev` / `npm run celular` local não alcança mais a API (ele usa `http://`).

**Instalar:** no Chrome do Android, menu ⋮ → **Instalar app** (ou o botão em Ajustes). No iPhone (Safari):
Compartilhar → **Adicionar à Tela de Início**.

## Usar no celular (dia a dia, com a seção C)

**Precisa estar ligado no PC:** Mosquitto (`docker compose up -d`), backend (`npm run dev`) e o Arduino
**ou** o simulador. O frontend local não é necessário: o app vem da Vercel.

**Cada pessoa:**

1. Conecta o celular **no mesmo Wi-Fi do PC**.
2. Abre `https://fechadura-inteligente.vercel.app` (ou lê o QR code).
3. Se o Chrome perguntar se o site pode acessar dispositivos na rede local, toca em **Permitir**.
4. Instala: Android (Chrome) ⋮ → **Instalar app**; iPhone (Safari) Compartilhar → **Adicionar à Tela de
   Início**.
5. Confere em **Ajustes**: conexão "tempo real (SSE)" e fechadura "online".

**Sinais no app:**

| O app mostra | Significa | O que fazer |
|---|---|---|
| Faixa **"Sem conexão"** | O celular não alcança a API | Mesmo Wi-Fi do PC? Backend rodando? IP do DuckDNS certo? |
| Selo **Offline** no Início | A API responde, mas a placa/simulador não manda estado | Ligue a placa ou rode `npm run simular` |
| **Online** | Tudo funcionando | — |

**Mudou de rede ou de PC** (ex.: hotspot na apresentação, outro computador): o IP do PC muda, então
atualize o DuckDNS. Veja o novo IP com `ipconfig` ("Adaptador de Rede sem Fio Wi-Fi" → "Endereço IPv4") e:

- **pelo site:** entre em [duckdns.org](https://www.duckdns.org), na linha `fechadurainteligente` troque o
  *current ip*, deixe *ipv6* vazio e clique em **update ip**; ou
- **sem login, pelo PowerShell** (na raiz do projeto, usa o token salvo):

  ```powershell
  $ip = (Get-NetIPAddress -AddressFamily IPv4 -InterfaceAlias Wi-Fi).IPAddress
  $token = (Get-Content frontend\certs\duckdns-token.txt -Raw).Trim() -replace '^token=', ''
  Invoke-RestMethod "https://www.duckdns.org/update?domains=fechadurainteligente&token=$token&ip=$ip"
  ```

  Sempre passe `ip=` com o IP **local**: sem ele, o DuckDNS grava o IP público da internet e o app para.

Confira com `nslookup fechadurainteligente.duckdns.org 1.1.1.1`. O celular pode levar alguns minutos para
ver o IP novo. O certificado e o app instalado continuam valendo; ninguém precisa reinstalar.

**Rodar em outro PC:** instale Node.js e Docker Desktop, clone o repositório e copie os arquivos que ficam
fora do Git (`backend/.env`, `mosquitto/config/passwd`, a pasta `backend/certs/` e o
`frontend/certs/duckdns-token.txt`). Rode os passos 1 e 2 de "Como rodar", atualize o IP no DuckDNS e, quando
o Windows perguntar sobre o firewall para o Node.js e o Docker, clique em **Permitir** (marcando redes
públicas). Se a placa usa o IP em `MQTT_HOST`, grave-a de novo com o IP novo.

> A API não tem login: qualquer pessoa no mesmo Wi-Fi pode comandar a fechadura. Para a apresentação, prefira
> uma rede própria (roteador ou hotspot) ao Wi-Fi aberto da faculdade.

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

- `backend`: `npm test` (36 testes: eventos, comandos com resposta e expiração, senhas, alertas, estado,
  leituras e ajustes) e `npm run typecheck`
- `frontend`: `npm test` (14 testes) e `npm run typecheck`
- `firmware`: `pio run` (compila) ou *Verify* na Arduino IDE
