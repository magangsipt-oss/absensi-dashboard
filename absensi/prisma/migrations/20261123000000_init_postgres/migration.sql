-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('Hadir', 'Terlambat', 'Pulang', 'Izin', 'Alpha');

-- CreateTable
CREATE TABLE "employees" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "nickname" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "pendingFingerprintId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_records" (
    "id" SERIAL NOT NULL,
    "employeeId" INTEGER,
    "name" TEXT NOT NULL,
    "time" TEXT NOT NULL,
    "status" "AttendanceStatus" NOT NULL,
    "note" TEXT NOT NULL,
    "checkedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webauthn_credentials" (
    "id" SERIAL NOT NULL,
    "employeeId" INTEGER NOT NULL,
    "credentialID" TEXT NOT NULL,
    "publicKey" TEXT NOT NULL,
    "counter" INTEGER NOT NULL DEFAULT 0,
    "transports" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webauthn_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fingerprint_mappings" (
    "id" SERIAL NOT NULL,
    "deviceId" TEXT,
    "templateId" INTEGER NOT NULL,
    "templateData" TEXT,
    "employeeId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fingerprint_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fingerprint_mapping_audits" (
    "id" SERIAL NOT NULL,
    "action" VARCHAR(32) NOT NULL,
    "templateId" INTEGER NOT NULL,
    "deviceId" TEXT,
    "previousEmployeeId" INTEGER,
    "employeeId" INTEGER,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fingerprint_mapping_audits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fingerprint_verification_logs" (
    "id" SERIAL NOT NULL,
    "employeeId" INTEGER,
    "deviceId" TEXT,
    "templateId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Berhasil',
    "note" TEXT,
    "verifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fingerprint_verification_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_commands" (
    "id" SERIAL NOT NULL,
    "deviceId" TEXT NOT NULL,
    "command" TEXT NOT NULL,
    "templateId" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "device_commands_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "employees_email_key" ON "employees"("email");

-- CreateIndex
CREATE UNIQUE INDEX "employees_pendingFingerprintId_key" ON "employees"("pendingFingerprintId");

-- CreateIndex
CREATE INDEX "employees_email_idx" ON "employees"("email");

-- CreateIndex
CREATE INDEX "attendance_records_employeeId_idx" ON "attendance_records"("employeeId");

-- CreateIndex
CREATE INDEX "attendance_records_status_idx" ON "attendance_records"("status");

-- CreateIndex
CREATE INDEX "attendance_records_checkedAt_idx" ON "attendance_records"("checkedAt");

-- CreateIndex
CREATE UNIQUE INDEX "webauthn_credentials_credentialID_key" ON "webauthn_credentials"("credentialID");

-- CreateIndex
CREATE INDEX "webauthn_credentials_employeeId_idx" ON "webauthn_credentials"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "fingerprint_mappings_templateId_key" ON "fingerprint_mappings"("templateId");

-- CreateIndex
CREATE INDEX "fingerprint_mapping_audits_templateId_changedAt_idx" ON "fingerprint_mapping_audits"("templateId", "changedAt");

-- CreateIndex
CREATE INDEX "fingerprint_mapping_audits_changedAt_idx" ON "fingerprint_mapping_audits"("changedAt");

-- CreateIndex
CREATE INDEX "fingerprint_verification_logs_employeeId_idx" ON "fingerprint_verification_logs"("employeeId");

-- CreateIndex
CREATE INDEX "fingerprint_verification_logs_templateId_idx" ON "fingerprint_verification_logs"("templateId");

-- CreateIndex
CREATE INDEX "fingerprint_verification_logs_verifiedAt_idx" ON "fingerprint_verification_logs"("verifiedAt");

-- CreateIndex
CREATE INDEX "device_commands_deviceId_status_idx" ON "device_commands"("deviceId", "status");

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webauthn_credentials" ADD CONSTRAINT "webauthn_credentials_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fingerprint_verification_logs" ADD CONSTRAINT "fingerprint_verification_logs_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

