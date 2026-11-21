
-- CreateEnum
CREATE TYPE "TipoEvento" AS ENUM ('ACESSO_LIBERADO', 'SENHA_INCORRETA', 'BLOQUEIO_INICIO', 'BLOQUEIO_FIM', 'PORTA_ABERTA', 'PORTA_FECHADA', 'PORTA_NAO_FECHOU', 'PORTA_FORCADA', 'ALARME_DESLIGADO', 'SENHA_ALTERADA');

-- CreateEnum
CREATE TYPE "Origem" AS ENUM ('TECLADO', 'TECLADO_SAIDA', 'BOTAO_SAIDA', 'APP', 'SENSOR', 'SISTEMA');

-- CreateEnum
CREATE TYPE "EstadoPorta" AS ENUM ('ABERTA', 'FECHADA', 'DESCONHECIDA');

-- CreateEnum
CREATE TYPE "EstadoTrava" AS ENUM ('ABERTA', 'FECHADA');

-- CreateEnum
CREATE TYPE "TipoComando" AS ENUM ('ABRIR_PORTA', 'FECHAR_PORTA', 'DESLIGAR_ALARME', 'TESTAR_BUZZER', 'DEFINIR_SENHA', 'REMOVER_SENHA', 'DEFINIR_CONFIG', 'ENVIAR_ESTADO');

-- CreateEnum
CREATE TYPE "StatusComando" AS ENUM ('PENDENTE', 'OK', 'FALHOU', 'EXPIRADO');

-- CreateEnum
CREATE TYPE "SincronizacaoSenha" AS ENUM ('PENDENTE', 'APLICADA', 'FALHOU', 'REMOVENDO');

-- CreateEnum
CREATE TYPE "TipoAlerta" AS ENUM ('PORTA_FORCADA', 'PORTA_NAO_FECHOU', 'ABERTA_DEMAIS', 'OFFLINE');

-- CreateEnum
CREATE TYPE "StatusAlerta" AS ENUM ('ATIVO', 'RESOLVIDO');

-- CreateTable
CREATE TABLE "Evento" (
    "id" TEXT NOT NULL,
    "idExterno" TEXT NOT NULL,
    "tipo" "TipoEvento" NOT NULL,
    "origem" "Origem" NOT NULL,
    "usuario" TEXT,
    "ocorridoEm" TIMESTAMP(3) NOT NULL,
    "recebidoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Evento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Leitura" (
    "id" SERIAL NOT NULL,
    "distanciaCm" INTEGER,
    "porta" "EstadoPorta" NOT NULL,
    "trava" "EstadoTrava" NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Leitura_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Senha" (
    "slot" INTEGER NOT NULL,
    "nome" TEXT NOT NULL,
    "senha" TEXT NOT NULL,
    "sincronizacao" "SincronizacaoSenha" NOT NULL DEFAULT 'PENDENTE',
    "motivo" TEXT,
    "comandoId" TEXT,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Senha_pkey" PRIMARY KEY ("slot")
);

-- CreateTable
CREATE TABLE "Comando" (
    "id" TEXT NOT NULL,
    "tipo" "TipoComando" NOT NULL,
    "params" JSONB,
    "status" "StatusComando" NOT NULL DEFAULT 'PENDENTE',
    "motivo" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondidoEm" TIMESTAMP(3),

    CONSTRAINT "Comando_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Alerta" (
    "id" TEXT NOT NULL,
    "tipo" "TipoAlerta" NOT NULL,
    "status" "StatusAlerta" NOT NULL DEFAULT 'ATIVO',
    "mensagem" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvidoEm" TIMESTAMP(3),

    CONSTRAINT "Alerta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Configuracao" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "tempoAberturaMs" INTEGER NOT NULL DEFAULT 5000,
    "limiteCm" INTEGER NOT NULL DEFAULT 10,
    "tempoMaxAbertaS" INTEGER NOT NULL DEFAULT 30,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Configuracao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Evento_idExterno_key" ON "Evento"("idExterno");

-- CreateIndex
CREATE INDEX "Evento_ocorridoEm_idx" ON "Evento"("ocorridoEm");

-- CreateIndex
CREATE INDEX "Evento_tipo_ocorridoEm_idx" ON "Evento"("tipo", "ocorridoEm");

-- CreateIndex
CREATE INDEX "Leitura_criadoEm_idx" ON "Leitura"("criadoEm");

-- CreateIndex
CREATE INDEX "Comando_status_criadoEm_idx" ON "Comando"("status", "criadoEm");

-- CreateIndex
CREATE INDEX "Alerta_status_criadoEm_idx" ON "Alerta"("status", "criadoEm");


-- No máximo um alerta ATIVO por tipo (um alerta por ocorrência, sem duplicar).
CREATE UNIQUE INDEX "Alerta_tipo_ativo_key" ON "Alerta"("tipo") WHERE "status" = 'ATIVO';
