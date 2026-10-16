-- CreateTable `arduino_devices`
CREATE TABLE `arduino_devices` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `deviceId` VARCHAR(191) NOT NULL,
    `ipAddress` VARCHAR(191) NOT NULL,
    `port` INTEGER NOT NULL DEFAULT 3000,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `lastChecked` DATETIME(3) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'Unknown',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `arduino_devices_deviceId_key`(`deviceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
