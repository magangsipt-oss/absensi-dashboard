-- CreateTable
CREATE TABLE `webauthn_credentials` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `employeeId` INTEGER NOT NULL,
    `credentialID` VARCHAR(191) NOT NULL,
    `publicKey` VARCHAR(191) NOT NULL,
    `counter` INTEGER NOT NULL DEFAULT 0,
    `transports` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `webauthn_credentials_credentialID_key`(`credentialID`),
    INDEX `webauthn_credentials_employeeId_idx`(`employeeId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `webauthn_credentials` ADD CONSTRAINT `webauthn_credentials_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `employees`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
