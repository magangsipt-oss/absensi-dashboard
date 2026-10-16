-- CreateTable
CREATE TABLE `fingerprint_mappings` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `deviceId` VARCHAR(191) NULL,
    `templateId` INTEGER NOT NULL,
    `employeeId` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `fingerprint_mappings_templateId_key`(`templateId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
