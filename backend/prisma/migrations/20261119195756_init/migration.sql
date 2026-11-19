-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'VIEWER');

-- CreateEnum
CREATE TYPE "DeviceStatus" AS ENUM ('ONLINE', 'OFFLINE');

-- CreateEnum
CREATE TYPE "PointType" AS ENUM ('DOOR', 'WINDOW');

-- CreateEnum
CREATE TYPE "PointState" AS ENUM ('OPEN', 'CLOSED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "SensorState" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "AccessEventType" AS ENUM ('ACCESS_GRANTED', 'ACCESS_DENIED', 'LOCKOUT_STARTED', 'LOCKOUT_ENDED', 'LOCK_RELEASED');

-- CreateEnum
CREATE TYPE "Direction" AS ENUM ('ENTRY', 'EXIT', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "AlertType" AS ENUM ('OPEN_TOO_LONG', 'DEVICE_OFFLINE');

-- CreateEnum
CREATE TYPE "AlertStatus" AS ENUM ('ACTIVE', 'RESOLVED');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'VIEWER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Device" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "deviceKeyHash" TEXT,
    "status" "DeviceStatus" NOT NULL DEFAULT 'OFFLINE',
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonitoredPoint" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "type" "PointType" NOT NULL,
    "currentState" "PointState" NOT NULL DEFAULT 'UNKNOWN',
    "lastKnownState" "SensorState",
    "stateChangedAt" TIMESTAMP(3),
    "lastEventAt" TIMESTAMP(3),
    "maxOpenSeconds" INTEGER NOT NULL DEFAULT 300,
    "deviceId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonitoredPoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccessEvent" (
    "id" UUID NOT NULL,
    "externalEventId" TEXT NOT NULL,
    "deviceId" UUID NOT NULL,
    "eventType" "AccessEventType" NOT NULL,
    "direction" "Direction" NOT NULL DEFAULT 'UNKNOWN',
    "directionConfirmedAt" TIMESTAMP(3),
    "directionConfirmedById" UUID,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "AccessEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SensorEvent" (
    "id" UUID NOT NULL,
    "externalEventId" TEXT NOT NULL,
    "deviceId" UUID NOT NULL,
    "monitoredPointId" UUID NOT NULL,
    "state" "SensorState" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SensorEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Alert" (
    "id" UUID NOT NULL,
    "type" "AlertType" NOT NULL,
    "status" "AlertStatus" NOT NULL DEFAULT 'ACTIVE',
    "message" TEXT NOT NULL,
    "monitoredPointId" UUID,
    "deviceId" UUID,
    "occurrenceKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" UUID,
    "resolutionNote" TEXT,

    CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "MonitoredPoint_deviceId_idx" ON "MonitoredPoint"("deviceId");

-- CreateIndex
CREATE INDEX "AccessEvent_occurredAt_idx" ON "AccessEvent"("occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "AccessEvent_deviceId_externalEventId_key" ON "AccessEvent"("deviceId", "externalEventId");

-- CreateIndex
CREATE INDEX "SensorEvent_monitoredPointId_occurredAt_idx" ON "SensorEvent"("monitoredPointId", "occurredAt");

-- CreateIndex
CREATE INDEX "SensorEvent_occurredAt_idx" ON "SensorEvent"("occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "SensorEvent_deviceId_externalEventId_key" ON "SensorEvent"("deviceId", "externalEventId");

-- CreateIndex
CREATE UNIQUE INDEX "Alert_occurrenceKey_key" ON "Alert"("occurrenceKey");

-- CreateIndex
CREATE INDEX "Alert_status_idx" ON "Alert"("status");

-- CreateIndex
CREATE INDEX "Alert_monitoredPointId_idx" ON "Alert"("monitoredPointId");

-- AddForeignKey
ALTER TABLE "MonitoredPoint" ADD CONSTRAINT "MonitoredPoint_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessEvent" ADD CONSTRAINT "AccessEvent_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessEvent" ADD CONSTRAINT "AccessEvent_directionConfirmedById_fkey" FOREIGN KEY ("directionConfirmedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SensorEvent" ADD CONSTRAINT "SensorEvent_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SensorEvent" ADD CONSTRAINT "SensorEvent_monitoredPointId_fkey" FOREIGN KEY ("monitoredPointId") REFERENCES "MonitoredPoint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_monitoredPointId_fkey" FOREIGN KEY ("monitoredPointId") REFERENCES "MonitoredPoint"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
