# Roteiro de demonstração (5 minutos)

**Antes de começar (5 min antes):**

- `docker compose up -d`, `npm run dev` no `backend/` e `npm run celular` + túnel no `frontend/`.
- O app aberto no celular (instalado) e espelhado no projetor. Arduino ligado, matriz mostrando o cadeado.
- Na tela **Início**: "Porta fechada", "Online". Senhas de teste: slot 1 `1234` (Admin) e slot 2 `2580` (Ana).
- **Não** deixe o simulador rodando.
- Plano B: se a placa falhar, pare tudo e rode `npm run simular` no backend. O app funciona igual.

| Tempo | O que fazer | O que falar |
|---|---|---|
| **0:00 – 0:30** | Mostre a montagem e o app na tela Início. | "É uma fechadura com senha no Arduino Uno R4 WiFi. O servo é a porta e o ultrassônico confirma se ela fechou. Tudo o que é segurança roda na placa; o app e o servidor só registram e comandam." |
| **0:30 – 1:15** | Digite `2580 #`. Aponte o servo abrindo, o ✓ na matriz e o LED. No app: cartão "Porta aberta", último acesso "Ana · Entrada". | "Senha certa: a porta abre por 5 segundos. O evento vai por MQTT pelo Wi-Fi e chega no app em tempo real, com o nome de quem entrou." |
| **1:15 – 2:00** | Digite `0000 #` três vezes. Mostre o ✗, o cadeado com a contagem de 30 s e o LED piscando. No app: chip "Teclado bloqueado". | "Três erros seguidos bloqueiam o teclado por 30 segundos. Isso é decidido na placa: não depende do servidor." |
| **2:00 – 2:45** | Com a porta fechada, afaste à mão o anteparo do sensor. Buzzer contínuo, triângulo piscando. No app: cartão vermelho "Alarme! Porta forçada" e alerta. Toque em **Desligar alarme** → "confirmado". | "Trancada e o sensor viu a porta abrir sem liberação: porta forçada. O alarme dispara e o app cria um alerta. Desligo pelo celular e a placa confirma o comando." |
| **2:45 – 3:20** | No app, toque em **Abrir porta** → confirme. Mostre "enviando… → confirmado" e o servo abrindo. | "Acionamento remoto: o comando vai para a placa, que responde. Se ela não responder em 15 s, o app mostra que falhou." |
| **3:20 – 4:05** | Abra **Histórico**: entrada (Ana), senhas erradas, bloqueio, porta forçada, alarme desligado e abertura pelo app. Abra **Gráficos**: a distância ao vivo (mexa a mão no sensor) e os acessos por hora. | "Tudo fica salvo no PostgreSQL: dá para filtrar por tipo e período. O gráfico da distância atualiza ao vivo, e a linha tracejada é o limite de porta fechada." |
| **4:05 – 4:50** | Corte a rede da placa: `docker compose stop mosquitto` (o app continua no ar; desligar o roteador derrubaria o celular também). O app mostra "Offline" depois de ~15 s. Digite `2580 #`: a porta abre normalmente. `docker compose start mosquitto` e mostre o evento chegando no histórico (a placa reconecta em até ~10 s). | "Sem rede, a fechadura continua funcionando: senha, bloqueio, saída e alarme. Os eventos ficam numa fila e são enviados quando a rede volta." |
| **4:50 – 5:00** | Volte para a tela Início. | "Resumindo: dois sensores, quatro atuadores, MQTT sem fio, histórico no banco, app com gráficos e controle remoto, e segurança que não depende da internet." |

**Se algo der errado:**

- App mostra "Sem comunicação" com a placa ligada: confira o Wi-Fi da placa no Monitor Serial (`s`).
- Comando "falhou: a fechadura está sem comunicação": espere o estado voltar (2 s) e tente de novo.
- Sensor "sem leitura": confira os fios do HC-SR04 (A0/A1, 5V e GND).
