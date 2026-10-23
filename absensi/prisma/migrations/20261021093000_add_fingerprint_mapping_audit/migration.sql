CREATE TABLE `fingerprint_mapping_audits` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `action` VARCHAR(32) NOT NULL,
    `templateId` INTEGER NOT NULL,
    `deviceId` VARCHAR(191) NULL,
    `previousEmployeeId` INTEGER NULL,
    `employeeId` INTEGER NULL,
    `changedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `fingerprint_mapping_audits_templateId_changedAt_idx`(`templateId`, `changedAt`),
    INDEX `fingerprint_mapping_audits_changedAt_idx`(`changedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `fingerprint_mapping_audits`
    (`action`, `templateId`, `deviceId`, `employeeId`, `changedAt`)
SELECT
    'BASELINE', `templateId`, `deviceId`, `employeeId`, CURRENT_TIMESTAMP(3)
FROM `fingerprint_mappings`;
