# Claude.md --- Fechadura Inteligente e Monitoramento de Aberturas Residenciais

## 1. Visão geral

Desenvolver um sistema de **fechadura com senha** integrado a um sistema
de **monitoramento de portas e janelas da residência**.

O projeto deve permitir:

-   Abrir uma fechadura elétrica por meio de uma senha digitada em um
    teclado matricial 4x4.
-   Detectar se a porta monitorada está aberta ou fechada por meio de um
    sensor magnético.
-   Acionar uma trava elétrica (solenoide) por meio de um módulo relé.
-   Após três senhas incorretas consecutivas, bloquear novas tentativas
    pelo período configurado e acionar um buzzer.
-   Registrar tentativas de acesso, desbloqueios, entradas e saídas
    identificadas pelo sistema e alterações no estado dos sensores.
-   Exibir em um painel web o estado atual das portas e janelas, o
    histórico de eventos e alertas de aberturas esquecidas.
-   Avisar quando uma porta ou janela permanecer aberta por mais tempo
    que o limite configurado.

O sistema será dividido obrigatoriamente em **duas pastas principais**:
uma exclusiva para o backend e outra exclusiva para o frontend. O
firmware do microcontrolador, caso seja desenvolvido neste projeto,
ficará em uma terceira pasta opcional e independente.

## 2. Estrutura obrigatória do repositório

Utilize a seguinte organização:

``` text
fechadura-inteligente/
├── backend/
│   ├── src/
│   │   ├── config/
│   │   ├── controllers/
│   │   ├── middlewares/
│   │   ├── routes/
│   │   ├── services/
│   │   ├── repositories/
│   │   ├── validators/
│   │   ├── mqtt/
│   │   ├── types/
│   │   ├── utils/
│   │   └── server.ts
│   ├── prisma/
│   │   └── schema.prisma
│   ├── tests/
│   ├── .env.example
│   ├── package.json
│   └── tsconfig.json
│
├── frontend/
│   ├── public/
│   ├── src/
│   │   ├── assets/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── layouts/
│   │   ├── services/
│   │   ├── hooks/
│   │   ├── contexts/
│   │   ├── types/
│   │   ├── utils/
│   │   ├── routes/
│   │   └── main.tsx
│   ├── .env.example
│   ├── package.json
│   └── tsconfig.json
│
├── firmware/                 # Opcional: código do ESP32/Arduino
├── docker-compose.yml        # PostgreSQL e, se utilizado, broker MQTT
└── README.md
```

**Regra de separação:** o backend deve conter toda a lógica de negócio,
acesso ao banco, autenticação, integração com dispositivos e validação.
O frontend deve conter somente a interface, estado de apresentação e
chamadas à API. O frontend nunca deve acessar o PostgreSQL diretamente.

Não colocar arquivos do backend dentro de `frontend/` nem arquivos da
interface dentro de `backend/`.

## 3. Arquitetura e tecnologias

### Backend

-   Node.js com TypeScript.
-   Express para criação da API REST.
-   PostgreSQL como banco de dados relacional.
-   Prisma ORM para modelagem, consultas e migrations.
-   Zod para validação dos dados recebidos.
-   bcrypt para hash de senhas de usuários.
-   JWT em cookie `HttpOnly` para autenticação do painel.
-   MQTT para comunicação entre o backend e o microcontrolador,
    preferencialmente usando um broker como Mosquitto.
-   Socket.IO ou Server-Sent Events para atualização em tempo real do
    painel. Escolher uma solução e documentar a decisão.
-   Jest ou Vitest e Supertest para testes.

### Frontend

-   React com TypeScript.
-   Vite para inicialização e build.
-   React Router para navegação.
-   Axios ou Fetch API para comunicação com o backend.
-   React Context ou outra solução simples para estado global de
    autenticação.
-   Biblioteca de gráficos somente se houver necessidade de gráficos no
    histórico.

### Hardware

O firmware pode ser executado em ESP32 ou placa equivalente, conforme os
componentes disponíveis:

-   Teclado matricial 4x4.
-   Sensor magnético para detectar abertura/fechamento da porta.
-   Módulo relé.
-   Trava elétrica tipo solenoide.
-   Buzzer.
-   Sensores magnéticos adicionais para outras portas e janelas, se
    disponíveis.

O microcontrolador é responsável pelo funcionamento local e imediato da
fechadura. A abertura por senha deve continuar funcionando mesmo se a
internet, o frontend ou o servidor estiver indisponível. O backend
registra e apresenta os eventos, mas não deve ser requisito para a
decisão local de liberar a fechadura.

## 4. Requisitos funcionais

### RF01 --- Cadastro e autenticação de usuários

-   Permitir autenticação de usuários autorizados no painel.
-   Armazenar senhas de usuários somente como hash.
-   Proteger as rotas privadas do backend.
-   Permitir encerramento da sessão.
-   Não armazenar senha em texto puro.

### RF02 --- Fechadura por senha

-   Receber a senha digitada no teclado matricial.
-   Validar a senha no próprio microcontrolador, sem depender da
    internet.
-   Em caso de senha válida, acionar o relé pelo tempo configurado para
    liberar a trava.
-   Registrar o evento de acesso autorizado quando houver comunicação
    disponível.
-   Nunca enviar a senha digitada em texto puro para o backend ou para o
    banco de dados.

A forma de provisionar ou atualizar a senha da fechadura deve ser
definida com segurança. Não criar uma rota que retorne a senha atual em
texto puro.

### RF03 --- Tentativas inválidas e bloqueio

-   Contabilizar tentativas incorretas consecutivas localmente no
    microcontrolador.
-   Na terceira tentativa incorreta consecutiva, bloquear novas
    tentativas pelo período configurado.
-   Acionar o buzzer quando o limite for atingido.
-   Registrar no backend o evento de bloqueio, quando a comunicação
    estiver disponível.
-   Reiniciar o contador de tentativas conforme a política definida após
    um acesso válido ou após o período de bloqueio.
-   O período de bloqueio deve ser configurável, com um valor padrão
    documentado.

O bloqueio deve ser executado localmente. Não depender de uma resposta
do servidor para impedir tentativas durante o bloqueio.

### RF04 --- Monitoramento de portas e janelas

-   Cadastrar cada ponto monitorado, como porta principal, porta dos
    fundos, janela da cozinha ou janela do quarto.
-   Cada ponto deve possuir um identificador e um dispositivo/sensor
    associado.
-   Receber eventos de abertura e fechamento.
-   Manter o estado mais recente de cada ponto: `ABERTO`, `FECHADO` ou
    `SEM_COMUNICACAO`.
-   Registrar cada mudança de estado com data e hora.
-   Exibir os estados no painel.

### RF05 --- Entradas e saídas

-   Registrar acessos autorizados pela fechadura.
-   Permitir identificar o tipo do evento como `ENTRADA`, `SAIDA` ou
    `ACESSO_SEM_DIRECAO_IDENTIFICADA`.
-   Não presumir que o sensor magnético, sozinho, consegue determinar se
    alguém entrou ou saiu.
-   Quando não houver mecanismo confiável para determinar a direção,
    registrar somente `ACESSO_AUTORIZADO` ou `ABERTURA_DETECTADA`.
-   Se o projeto precisar identificar entrada e saída automaticamente,
    prever um mecanismo adicional, como dois sensores em sequência,
    identificação individual ou confirmação pelo usuário no painel.

### RF06 --- Alerta de abertura esquecida

-   Permitir configurar um tempo máximo de abertura para cada porta ou
    janela.
-   Se o sensor continuar indicando `ABERTO` após esse limite, gerar um
    alerta.
-   Exibir alertas ativos no painel.
-   Registrar quando o alerta foi criado e quando foi resolvido.
-   Não criar alertas duplicados continuamente para a mesma ocorrência.
-   Encerrar ou resolver o alerta quando o sensor indicar fechamento.

### RF07 --- Histórico

Disponibilizar histórico filtrável por:

-   Período.
-   Dispositivo ou ponto monitorado.
-   Tipo de evento.
-   Resultado do acesso.
-   Estado do sensor.

O histórico deve incluir, quando aplicável, data/hora, origem,
dispositivo, tipo de evento e resultado.

### RF08 --- Estado de comunicação

-   Registrar a última comunicação recebida de cada dispositivo.
-   Exibir dispositivo online ou sem comunicação.
-   Considerar um dispositivo sem comunicação quando ultrapassar o
    intervalo de heartbeat configurado.
-   Não apresentar um estado antigo como se fosse uma leitura atual:
    mostrar a última atualização.

## 5. Regras de negócio

1.  A validação da senha e o acionamento físico da trava são
    responsabilidades do firmware.
2.  O backend não recebe nem armazena a senha digitada no teclado.
3.  O backend recebe eventos estruturados do dispositivo, nunca
    credenciais em texto puro.
4.  Três senhas incorretas consecutivas provocam bloqueio local e
    acionamento do buzzer.
5.  O tempo de acionamento do relé deve ser limitado e configurável no
    firmware.
6.  A abertura/fechamento é determinada pelo sensor magnético.
7.  Um sensor magnético simples não identifica a pessoa nem a direção do
    deslocamento.
8.  O alerta de abertura prolongada deve ser gerado uma única vez por
    ocorrência, até que a abertura seja encerrada.
9.  Eventos recebidos de dispositivos devem possuir identificador único
    para evitar duplicidade em caso de reenvio.
10. O horário do evento deve ser enviado pelo dispositivo quando
    confiável e o backend também deve registrar o horário de
    recebimento.
11. Se o dispositivo ficar offline, deve manter uma fila local de
    eventos, quando a capacidade do hardware permitir, e reenviá-los ao
    reconectar.
12. Falhas de comunicação não devem provocar abertura automática da
    fechadura.

## 6. Modelo de dados --- PostgreSQL

Utilize migrations do Prisma. O modelo inicial deve contemplar as
entidades abaixo; ajuste nomes e relacionamentos conforme a
implementação.

### User

-   `id`: UUID, chave primária.
-   `name`: nome do usuário.
-   `email`: e-mail único.
-   `passwordHash`: hash da senha.
-   `createdAt`: data de criação.
-   `updatedAt`: data de atualização.

### Device

Representa o microcontrolador ou dispositivo responsável por um ou mais
sensores/atuadores.

-   `id`: UUID.
-   `name`: nome do dispositivo.
-   `deviceKeyHash`: hash de uma credencial exclusiva do dispositivo.
-   `status`: `ONLINE` ou `OFFLINE`.
-   `lastSeenAt`: última comunicação.
-   `createdAt` e `updatedAt`.

A credencial do dispositivo deve ser validada pelo backend e nunca
exibida no frontend. Armazenar somente seu hash, sempre que a estratégia
de autenticação permitir.

### MonitoredPoint

Representa uma porta ou janela monitorada.

-   `id`: UUID.
-   `name`: nome amigável.
-   `location`: cômodo ou localização.
-   `type`: `DOOR` ou `WINDOW`.
-   `currentState`: `OPEN`, `CLOSED` ou `UNKNOWN`.
-   `maxOpenSeconds`: limite de abertura em segundos.
-   `deviceId`: relacionamento com `Device`.
-   `createdAt` e `updatedAt`.

### AccessEvent

Registra eventos da fechadura.

-   `id`: UUID.
-   `deviceId`: dispositivo de origem.
-   `eventType`: `ACCESS_GRANTED`, `ACCESS_DENIED`, `LOCKOUT_STARTED`,
    `LOCK_RELEASED`.
-   `direction`: `ENTRY`, `EXIT` ou `UNKNOWN`, quando aplicável.
-   `occurredAt`: horário informado pelo dispositivo.
-   `receivedAt`: horário de recebimento pelo backend.
-   `metadata`: JSON opcional sem senha ou segredo.

### SensorEvent

Registra mudanças de estado dos sensores.

-   `id`: UUID.
-   `externalEventId`: identificador único gerado pelo dispositivo.
-   `monitoredPointId`: ponto monitorado.
-   `state`: `OPEN` ou `CLOSED`.
-   `occurredAt`: horário do evento no dispositivo.
-   `receivedAt`: horário de recebimento no servidor.

Criar restrição única para `externalEventId` em conjunto com a
identificação do dispositivo, para impedir duplicação de eventos
reenviados.

### Alert

-   `id`: UUID.
-   `monitoredPointId`: ponto monitorado.
-   `type`: por exemplo `OPEN_TOO_LONG` ou `DEVICE_OFFLINE`.
-   `status`: `ACTIVE` ou `RESOLVED`.
-   `message`: descrição do alerta.
-   `createdAt`: criação.
-   `resolvedAt`: resolução, anulável.

### Session ou RefreshToken (opcional)

Caso a autenticação utilize renovação de sessão, armazenar tokens de
forma segura, com expiração e possibilidade de revogação. Não é
necessário criar essa tabela se a estratégia inicial de sessão não
utilizar refresh token.

## 7. API REST --- backend

Prefixo: `/api`.

### Autenticação do painel

-   `POST /api/auth/login` --- autenticar usuário.
-   `POST /api/auth/logout` --- encerrar sessão.
-   `GET /api/auth/me` --- retornar usuário autenticado.

Usar cookie `HttpOnly`, `Secure` em produção e configuração adequada de
`SameSite`. Configurar CORS para aceitar somente a origem do frontend e
permitir credenciais. Proteger contra CSRF de acordo com a estratégia de
cookies adotada.

### Dispositivos

-   `GET /api/devices` --- listar dispositivos.
-   `GET /api/devices/:id` --- detalhar dispositivo.
-   `POST /api/devices` --- cadastrar dispositivo.
-   `PATCH /api/devices/:id` --- atualizar informações.
-   `GET /api/devices/:id/status` --- consultar comunicação e última
    atividade.

### Pontos monitorados

-   `GET /api/monitored-points` --- listar portas e janelas.
-   `GET /api/monitored-points/:id` --- detalhar ponto.
-   `POST /api/monitored-points` --- cadastrar ponto.
-   `PATCH /api/monitored-points/:id` --- editar ponto, limite de
    abertura ou localização.
-   `GET /api/monitored-points/:id/events` --- histórico do ponto.

### Eventos recebidos dos dispositivos

-   `POST /api/device-events/access` --- registrar evento da fechadura.
-   `POST /api/device-events/sensor` --- registrar mudança de estado de
    sensor.
-   `POST /api/device-events/heartbeat` --- atualizar última comunicação
    do dispositivo.

Essas rotas devem exigir autenticação própria de dispositivo, separada
da autenticação do usuário do painel. Validar o formato e os campos de
cada evento. Não aceitar senha digitada nem dados secretos
desnecessários.

Se for utilizado MQTT, os eventos podem chegar por assinaturas de
tópicos autenticados, e as rotas HTTP podem ser mantidas para testes ou
provisionamento. Documentar claramente qual canal será usado na versão
final.

### Histórico e alertas

-   `GET /api/events` --- listar eventos com filtros e paginação.
-   `GET /api/alerts` --- listar alertas.
-   `GET /api/alerts/active` --- listar alertas ativos.
-   `PATCH /api/alerts/:id/resolve` --- resolver alerta, quando
    permitido.

### Respostas e erros

Padronizar respostas JSON. Exemplo de sucesso:

``` json
{
  "data": {
    "id": "uuid",
    "state": "OPEN"
  }
}
```

Exemplo de erro:

``` json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Dados inválidos.",
    "details": []
  }
}
```

Utilizar códigos HTTP adequados (`200`, `201`, `400`, `401`, `403`,
`404`, `409`, `500`). Não enviar stack traces ou detalhes internos ao
cliente em produção.

## 8. Comunicação com o hardware

Implementar uma camada isolada em `backend/src/mqtt/` ou equivalente
para não misturar protocolo de comunicação com regras de negócio.

### Exemplo de evento de sensor

``` json
{
  "eventId": "identificador-unico",
  "deviceId": "uuid-do-dispositivo",
  "pointId": "uuid-do-ponto",
  "eventType": "SENSOR_STATE_CHANGED",
  "state": "OPEN",
  "occurredAt": "2026-11-19T18:30:00.000Z"
}
```

### Exemplo de evento de acesso

``` json
{
  "eventId": "identificador-unico",
  "deviceId": "uuid-do-dispositivo",
  "eventType": "ACCESS_GRANTED",
  "direction": "UNKNOWN",
  "occurredAt": "2026-11-19T18:31:00.000Z"
}
```

Os exemplos são contratos ilustrativos. A implementação deve validar os
campos, autenticar a origem e impedir repetição de eventos. Nunca
incluir a senha digitada, hash da senha da fechadura ou chave secreta no
payload.

### Tópicos MQTT sugeridos

Se MQTT for adotado, usar tópicos separados por dispositivo, por
exemplo:

-   `home/devices/{deviceId}/events/access`
-   `home/devices/{deviceId}/events/sensors`
-   `home/devices/{deviceId}/status`

Configurar autenticação, ACL por dispositivo e TLS quando aplicável. Não
permitir publicação anônima em produção.

## 9. Frontend --- React + TypeScript

Criar uma interface responsiva, em português, com visual simples e de
fácil leitura.

### Páginas

1.  **Login**
    -   E-mail e senha.
    -   Mensagens de validação.
    -   Redirecionamento após autenticação.
2.  **Dashboard**
    -   Resumo de portas/janelas abertas e fechadas.
    -   Alertas ativos.
    -   Estado online/offline dos dispositivos.
    -   Últimos eventos recebidos.
    -   Horário da última atualização.
3.  **Monitoramento**
    -   Lista de portas e janelas cadastradas.
    -   Identificação do cômodo.
    -   Estado atual com indicação visual e textual.
    -   Tempo em que o ponto está aberto, quando disponível.
    -   Aviso para pontos sem comunicação.
4.  **Histórico**
    -   Lista de eventos de acesso e sensores.
    -   Filtros por data, dispositivo, ponto e tipo.
    -   Paginação.
5.  **Alertas**
    -   Alertas ativos e resolvidos.
    -   Data de criação.
    -   Ponto relacionado.
    -   Ação para resolver alerta, quando apropriado.
6.  **Configurações**
    -   Cadastro/edição de pontos monitorados.
    -   Configuração do tempo máximo de abertura.
    -   Cadastro e visualização de dispositivos.
    -   Não exibir credenciais secretas nem senhas da fechadura.

### Componentes sugeridos

-   `StatusCard`
-   `MonitoredPointCard`
-   `AlertList`
-   `EventTable`
-   `DeviceStatus`
-   `ProtectedRoute`
-   `PageHeader`
-   `LoadingState`
-   `ErrorMessage`
-   `EmptyState`

### Comunicação com o backend

Centralizar as chamadas HTTP em `frontend/src/services/`. Utilizar uma
variável de ambiente, por exemplo `VITE_API_URL`, para definir a URL do
backend. Enviar cookies nas requisições autenticadas
(`credentials: 'include'` no Fetch ou `withCredentials: true` no Axios).

Criar tipos TypeScript para usuários, dispositivos, pontos monitorados,
eventos e alertas. Não duplicar regras de negócio no frontend:
validações visuais ajudam a experiência, mas o backend deve validar
novamente.

Atualizar o dashboard por Socket.IO, SSE ou polling. Exibir claramente a
data/hora da última atualização e tratar perda de conexão.

## 10. Segurança e confiabilidade

-   Nunca armazenar senhas em texto puro.
-   Nunca enviar a senha digitada no teclado para o backend.
-   Usar credenciais distintas para usuários e dispositivos.
-   Armazenar segredos em variáveis de ambiente, nunca no Git.
-   Validar todas as entradas no backend.
-   Usar HTTPS em produção.
-   Restringir CORS à origem autorizada.
-   Configurar cookies seguros e proteção CSRF.
-   Aplicar rate limit no login e nas rotas sensíveis.
-   Registrar logs sem senhas, tokens ou segredos.
-   Aplicar autorização nas operações administrativas.
-   Proteger o broker MQTT com autenticação e ACL.
-   Implementar idempotência para eventos de dispositivos.
-   Não permitir que uma falha no servidor libere a fechadura.
-   Projetar a instalação elétrica com isolamento e componentes
    adequados; a ligação do relé e da trava deve respeitar as
    especificações elétricas e ser validada por pessoa capacitada.

## 11. Variáveis de ambiente

### Backend --- `backend/.env.example`

``` env
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/fechadura_inteligente
JWT_SECRET=alterar_este_segredo
FRONTEND_URL=http://localhost:5173
COOKIE_NAME=access_token

MQTT_URL=mqtt://localhost:1883
MQTT_USERNAME=
MQTT_PASSWORD=
```

Usar valores fortes e próprios em cada ambiente. O `.env` real não deve
ser versionado.

### Frontend --- `frontend/.env.example`

``` env
VITE_API_URL=http://localhost:3000/api
```

Variáveis `VITE_` são públicas e não podem conter senhas, tokens
privados ou chaves secretas.

## 12. Docker e banco de dados

Criar `docker-compose.yml` na raiz para executar PostgreSQL e, se
escolhido, Mosquitto. O backend e o frontend podem ser executados
localmente durante o desenvolvimento ou adicionados ao Compose
posteriormente.

Configurar volume persistente para o PostgreSQL. Criar banco
`fechadura_inteligente`. Documentar comandos para iniciar os serviços,
instalar dependências e executar migrations.

Não expor o banco publicamente em produção. Utilizar usuário e senha
próprios, diferentes dos exemplos de desenvolvimento.

## 13. Testes mínimos

### Backend

-   Login válido e inválido.
-   Bloqueio de rotas privadas sem autenticação.
-   Cadastro e consulta de dispositivos.
-   Cadastro e consulta de portas/janelas.
-   Recebimento de evento de abertura e fechamento.
-   Rejeição de evento inválido.
-   Idempotência de evento repetido.
-   Criação de alerta após o tempo máximo de abertura.
-   Resolução do alerta após fechamento.
-   Autenticação de dispositivo.
-   Garantia de que payloads não aceitam senha digitada.

### Frontend

-   Exibição dos estados de portas e janelas.
-   Exibição de alertas ativos.
-   Tratamento de carregamento, erro e lista vazia.
-   Proteção de páginas privadas.
-   Atualização dos dados após novos eventos.
-   Filtros do histórico.

O bloqueio após três tentativas e o acionamento do buzzer precisam ser
testados no firmware/hardware, não apenas em testes da API.

## 14. Ordem recomendada de implementação

1.  Criar a estrutura `backend/` e `frontend/`.
2.  Configurar PostgreSQL e Docker Compose.
3.  Implementar o schema Prisma e migrations.
4.  Implementar autenticação do painel.
5.  Implementar cadastro de dispositivos e pontos monitorados.
6.  Implementar recebimento e persistência de eventos.
7.  Implementar cálculo de estado atual e alertas de abertura
    prolongada.
8.  Implementar autenticação dos dispositivos.
9.  Implementar integração MQTT ou HTTP com o firmware.
10. Implementar o frontend: login, dashboard, monitoramento, histórico e
    alertas.
11. Implementar atualização em tempo real.
12. Criar testes, documentação e instruções de execução.

Entregar cada etapa funcional antes de avançar para a próxima. Não criar
todas as telas com dados fictícios como substituto da integração real.

## 15. Critérios de conclusão

O projeto será considerado funcional quando:

-   A senha correta liberar a fechadura localmente.
-   Três senhas incorretas consecutivas bloquearem novas tentativas e
    acionarem o buzzer.
-   O sensor registrar abertura e fechamento.
-   Os eventos forem enviados ao backend e persistidos no PostgreSQL.
-   O painel mostrar o estado mais recente de cada porta/janela.
-   Uma abertura que ultrapasse o limite gerar um alerta.
-   O fechamento resolver o alerta correspondente.
-   O histórico permitir consultar acessos e mudanças dos sensores.
-   O painel exigir autenticação.
-   A aplicação continuar segura e previsível quando o servidor ou a
    internet estiverem indisponíveis.

## 16. Observações e limites do escopo

-   O sensor magnético informa se o ponto está aberto ou fechado; não
    identifica quem abriu.
-   Um único sensor na porta não determina, por si só, se houve entrada
    ou saída. Para esse recurso, implementar um método adicional de
    identificação de direção.
-   O sistema pode indicar que uma janela ou porta ficou aberta, mas não
    consegue afirmar que um equipamento, torneira ou outro objeto foi
    deixado ligado/aberto sem sensores específicos para esses itens.
-   A lógica de segurança da fechadura deve permanecer no
    microcontrolador. O backend é responsável por persistência,
    histórico, alertas e visualização.
-   Começar com uma porta e um sensor magnético. Depois, generalizar o
    cadastro para várias portas e janelas.
