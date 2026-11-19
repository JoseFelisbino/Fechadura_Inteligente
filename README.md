# Fechadura Inteligente e Monitoramento de Aberturas

Fechadura com senha em teclado 4x4 (ESP32 + relé + solenoide + buzzer) integrada a um
painel web que monitora portas e janelas por sensores magnéticos, guarda o histórico e
emite alertas de aberturas esquecidas.

```text
.
├── backend/     API REST (Node.js, TypeScript, Express, Prisma, PostgreSQL, MQTT, SSE)
├── frontend/    Painel (React, TypeScript, Vite, React Router)
├── firmware/    ESP32 (PlatformIO / Arduino)
├── mosquitto/   Configuração do broker MQTT (ACL por dispositivo)
└── docker-compose.yml   PostgreSQL + Mosquitto
```

## Decisões de arquitetura

| Tema | Decisão |
|---|---|
| Decisão de abrir a trava | **Somente no firmware.** A senha é validada no ESP32 contra um hash (SHA-256 iterado com salt) gravado na NVS. Nada recebido pela rede aciona o relé. |
| Canal dispositivo → backend | **MQTT é o canal da versão final** (QoS 1, broker Mosquitto com usuário/senha por dispositivo e ACL). As rotas `POST /api/device-events/*` continuam disponíveis para testes, provisionamento e contingência, com autenticação própria (`X-Device-Id` + `X-Device-Key`). Os dois canais usam os mesmos validadores e serviços. |
| Tempo real no painel | **Server-Sent Events** (`GET /api/stream`). O fluxo é só servidor → navegador, então o SSE basta: usa HTTP comum, reconecta sozinho, aceita o cookie HttpOnly e não exige outra biblioteca. As mensagens só avisam o que mudou e a tela busca os dados de novo pela API REST. Se o SSE cair, o painel mostra um aviso e passa a recarregar a cada 30 s. |
| Sessão do painel | JWT (HS256, 8 h) em cookie `HttpOnly`, `SameSite=Lax` e `Secure` em produção. Sem refresh token, por isso não há tabela de sessão. |
| CSRF | Cookie `SameSite=Lax` **+** cabeçalho obrigatório `X-Requested-With: XMLHttpRequest` em toda requisição que altera estado. Formulários de outros sites não conseguem enviar esse cabeçalho, e um `fetch` de outra origem é barrado no preflight do CORS, que só aceita `FRONTEND_URL`. |
| Autorização | Perfis `ADMIN` (cadastra e edita dispositivos e pontos) e `VIEWER` (consulta, resolve alertas e confirma a direção de acessos). |
| Credencial do dispositivo | Gerada **somente no servidor** por `npm run device:provision` e exibida uma única vez no terminal. O banco guarda o hash bcrypt e o Mosquitto guarda o hash PBKDF2. Ela nunca passa pelo frontend, que só mostra "credencial provisionada/pendente". |
| Senha da fechadura | Definida no primeiro boot a partir de `INITIAL_LOCK_PIN` (em `secrets.h`, fora do Git). Depois é trocada **no próprio teclado**: `A` → senha atual `#` → nova `#` → confirmação `#`. Não existe rota que leia ou altere essa senha. |
| Bloqueio | 3 senhas incorretas seguidas → bloqueio local de **60 s** (`LOCKOUT_MS`) e alarme no buzzer. O contador volta a zero após um acesso válido ou no fim do bloqueio. O bloqueio fica salvo na NVS, então reiniciar o ESP32 não o encerra. |
| Entrada/saída | Um sensor magnético não informa a direção. O teclado registra `direction=UNKNOWN` (exibido como "Sem direção identificada"). A direção vem de dois mecanismos opcionais: **(1)** botão interno de saída (`EXIT_BUTTON_PIN`), que gera `EXIT`, ou **(2)** confirmação pelo usuário no Histórico (`PATCH /api/events/access/:id/direction`). |
| Idempotência | `@@unique([deviceId, externalEventId])` em `AccessEvent` e `SensorEvent`. Um evento repetido responde `200 { duplicate: true }` e não é gravado de novo. O firmware gera IDs `<contador de boot>-<sequência>`. |
| Horários | `occurredAt` vem do dispositivo quando o NTP está sincronizado. Se faltar, ou se estiver mais de 5 min no futuro, o backend usa `receivedAt`, que é sempre registrado. Eventos antigos reenviados da fila entram no histórico, mas não sobrescrevem um estado mais recente. |
| Alerta de abertura | Um job a cada 5 s cria `OPEN_TOO_LONG` quando o ponto passa de `maxOpenSeconds`. A coluna única `occurrenceKey` garante **um alerta por abertura**, mesmo após resolução manual. O fechamento resolve o alerta automaticamente. A resolução manual é recusada (409) enquanto o ponto continuar aberto. |
| Comunicação | Sem heartbeat por 90 s (`HEARTBEAT_TIMEOUT_SECONDS`), ou com o testamento MQTT `OFFLINE`, o dispositivo vira `OFFLINE`, seus pontos viram `UNKNOWN` ("Sem comunicação") e é criado o alerta `DEVICE_OFFLINE`. A última leitura fica em `lastKnownState` e o painel a mostra como **última leitura**, nunca como estado atual. |
| Fila offline | O firmware guarda até 64 eventos em RAM e os reenvia ao reconectar. Um evento só sai da fila depois do PUBACK do broker. Ao reconectar, o firmware também envia o estado atual de todos os sensores. |

## Pré-requisitos

- Node.js 20+ (testado com 24)
- Docker Desktop **ou** um PostgreSQL 14+ local
- PlatformIO (extensão do VS Code ou `pip install platformio`) para o firmware

## Como executar

### 1. Variáveis de ambiente

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

Edite `backend/.env` e defina, no mínimo, `JWT_SECRET` (valor longo e aleatório),
`MQTT_PASSWORD` e `SEED_ADMIN_PASSWORD`. Se já existir um PostgreSQL local na porta 5432,
use `POSTGRES_HOST_PORT=5433 docker compose up -d` e troque a porta nas URLs do `.env`.

### 2. Usuário MQTT do backend e serviços

```bash
cd backend
npm install
npm run mqtt:user                 # grava o usuário "backend" em mosquitto/config/passwd
cd ..
docker compose up -d              # PostgreSQL + Mosquitto
```

### 3. Banco de dados

```bash
cd backend
npx prisma migrate deploy         # aplica as migrations (em desenvolvimento: npm run prisma:migrate)
npm run seed                      # cria o administrador definido em SEED_ADMIN_*
npm run dev                       # API em http://localhost:3000/api
```

### 4. Frontend

```bash
cd frontend
npm install
npm run dev                       # painel em http://localhost:5173
```

### 5. Dispositivo

1. No painel, em **Configurações**, cadastre o dispositivo e o ponto monitorado (ex.: "Porta principal").
2. Gere a credencial no servidor (ela aparece **uma única vez**):
   ```bash
   cd backend
   npm run device:provision -- --id <ID do dispositivo>
   docker compose kill -s SIGHUP mosquitto    # recarrega as senhas do broker
   ```
3. Copie `firmware/fechadura_esp32/include/secrets.example.h` para `secrets.h` e preencha
   Wi-Fi, `MQTT_HOST`, `DEVICE_ID`, `DEVICE_KEY`, o `pointId` de cada sensor e a senha inicial.
4. `cd firmware/fechadura_esp32 && pio run -t upload && pio device monitor`

Sem hardware, é possível simular o dispositivo pelas rotas HTTP:

```bash
curl -X POST http://localhost:3000/api/device-events/sensor \
  -H "Content-Type: application/json" \
  -H "X-Device-Id: <DEVICE_ID>" -H "X-Device-Key: <DEVICE_KEY>" \
  -d '{"eventId":"sim-1","pointId":"<POINT_ID>","state":"OPEN"}'
```

## Testes

```bash
cd backend && npm test     # Vitest + Supertest em um schema separado (DATABASE_URL_TEST)
cd frontend && npm test    # Vitest + Testing Library
```

O backend aplica as migrations no schema `test` antes da suíte e limpa as tabelas antes de
cada teste. **Bloqueio após 3 tentativas, buzzer e relé precisam ser testados no hardware**
(roteiro abaixo).

### Roteiro de teste do hardware

1. Senha correta → relé liga por 3 s, evento `ACCESS_GRANTED`/`LOCK_RELEASED` aparece no Histórico.
2. Três senhas incorretas → buzzer toca 3 s; durante 60 s nenhuma tecla é aceita, inclusive a senha correta; `LOCKOUT_STARTED` e depois `LOCKOUT_ENDED` no Histórico.
3. Reiniciar o ESP32 durante o bloqueio → o bloqueio é retomado.
4. Desligar o backend ou o Wi-Fi → a senha correta continua abrindo; ao religar, os eventos da fila chegam ao painel.
5. Abrir a porta além do limite → alerta "Abertura prolongada"; fechar → alerta resolvido.
6. Desligar o ESP32 → em até 90 s o painel mostra "Sem comunicação".

## API (prefixo `/api`)

| Método | Rota | Acesso |
|---|---|---|
| POST | `/auth/login`, `/auth/logout` · GET `/auth/me` | público / sessão |
| GET | `/devices`, `/devices/:id`, `/devices/:id/status` | sessão |
| POST/PATCH | `/devices`, `/devices/:id` | ADMIN |
| GET | `/monitored-points`, `/monitored-points/:id`, `/monitored-points/:id/events` | sessão |
| POST/PATCH | `/monitored-points`, `/monitored-points/:id` | ADMIN |
| GET | `/events?from&to&deviceId&pointId&category&eventType&result&state&page&pageSize` | sessão |
| PATCH | `/events/access/:id/direction` | sessão |
| GET | `/alerts?status&type&page&pageSize`, `/alerts/active` | sessão |
| PATCH | `/alerts/:id/resolve` | sessão |
| GET | `/stream` (SSE) | sessão |
| POST | `/device-events/access`, `/device-events/sensor`, `/device-events/heartbeat` | credencial do dispositivo |

Respostas de sucesso: `{ "data": ..., "meta"?: { page, pageSize, total } }`.
Respostas de erro: `{ "error": { "code", "message", "details": [] } }`.

### Tópicos MQTT

| Tópico | Payload |
|---|---|
| `home/devices/{deviceId}/events/access` | `{ eventId, deviceId, eventType, direction, occurredAt?, metadata? }` |
| `home/devices/{deviceId}/events/sensors` | `{ eventId, deviceId, pointId, eventType: "SENSOR_STATE_CHANGED", state, occurredAt? }` |
| `home/devices/{deviceId}/status` | heartbeat `{ status: "ONLINE", uptimeMs, queued, rssi, firmware }` ou testamento `{ status: "OFFLINE" }` |

Os payloads são validados com `.strict()`: qualquer campo não previsto, como `password`,
`pin` ou `code`, faz o evento ser rejeitado.

## Ligações sugeridas (ESP32 DevKit)

| Componente | GPIO |
|---|---|
| Teclado (linhas / colunas) | 13, 12, 14, 27 / 26, 25, 33, 32 |
| Relé (IN) | 23 |
| Buzzer | 22 |
| Sensor magnético da porta | 4 (outro terminal no GND) |

> ⚠️ A solenoide usa fonte própria (12 V típico), com diodo de roda livre e relé ou módulo
> adequado à corrente. A instalação elétrica deve ser validada por pessoa capacitada.
> O relé fica desligado no boot e em qualquer falha (*fail-secure*). Para uma fechadura que
> precisa abrir em queda de energia (*fail-safe*), avalie a norma local.

## Segurança em produção

- Use HTTPS no backend e TLS no Mosquitto (porta 8883), e `NODE_ENV=production`.
- Troque todas as senhas e segredos de exemplo. Não exponha PostgreSQL nem o broker à internet.
- `.env`, `secrets.h` e `mosquitto/config/passwd` estão no `.gitignore`.
- Há rate limit no login (10 a cada 15 min), nas rotas de dispositivo e nas operações administrativas.
- Os logs passam por `redact`, que mascara chaves como `password`, `token` e `key`.
