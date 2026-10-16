CREATE TABLE `device_commands` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `deviceId` VARCHAR(191) NOT NULL,
    `command` VARCHAR(191) NOT NULL,
    `templateId` INTEGER NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `processedAt` DATETIME(3) NULL,

    INDEX `device_commands_deviceId_status_idx`(`deviceId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;