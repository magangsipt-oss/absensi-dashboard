-- CreateTable
CREATE TABLE `employees` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `department` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `employees_email_key`(`email`),
    INDEX `employees_email_idx`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `attendance_records` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `employeeId` INTEGER NULL,
    `name` VARCHAR(191) NOT NULL,
    `time` VARCHAR(191) NOT NULL,
    `status` ENUM('Hadir', 'Terlambat', 'Izin', 'Alpha') NOT NULL,
    `note` LONGTEXT NOT NULL,
    `checkedAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `attendance_records_employeeId_idx`(`employeeId`),
    INDEX `attendance_records_status_idx`(`status`),
    INDEX `attendance_records_checkedAt_idx`(`checkedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `attendance_records` ADD CONSTRAINT `attendance_records_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `employees`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
