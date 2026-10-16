ALTER TABLE `attendance_records`
MODIFY `status` ENUM('Hadir', 'Terlambat', 'Pulang', 'Izin', 'Alpha') NOT NULL;

ALTER TABLE `fingerprint_mappings`
ADD COLUMN `templateData` LONGTEXT NULL;

CREATE TABLE `fingerprint_verification_logs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `employeeId` INTEGER NULL,
    `deviceId` VARCHAR(191) NULL,
    `templateId` INTEGER NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'Berhasil',
    `note` LONGTEXT NULL,
    `verifiedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `fingerprint_verification_logs_employeeId_idx`(`employeeId`),
    INDEX `fingerprint_verification_logs_templateId_idx`(`templateId`),
    INDEX `fingerprint_verification_logs_verifiedAt_idx`(`verifiedAt`),
    PRIMARY KEY (`id`),
    CONSTRAINT `fingerprint_verification_logs_employeeId_fkey`
      FOREIGN KEY (`employeeId`) REFERENCES `employees`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;