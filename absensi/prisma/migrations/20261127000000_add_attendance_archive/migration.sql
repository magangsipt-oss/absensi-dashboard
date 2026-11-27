-- CreateTable
CREATE TABLE "attendance_archives" (
    "id" SERIAL NOT NULL,
    "month" VARCHAR(7) NOT NULL,
    "rowCount" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "sha256" VARCHAR(64) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_archives_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "attendance_archives_month_idx" ON "attendance_archives"("month");

